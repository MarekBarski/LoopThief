// ===========================================================================
// Audio capture engine.
//
// State machine:
//   Idle       -- no streams open. Default at boot.
//   Capturing  -- input stream open, pre-roll ring buffer filling. No
//                 recording, no Tauri events emitted.
//   Recording  -- same plus: frames are also pushed into an accumulator
//                 Vec, AND emitted to JS via the `audio:frame` Tauri event
//                 for live waveform.
//
// Stream construction (Bug 2 fix, session 25):
//   * Host: explicit WASAPI on Windows via `devices::get_host()`. Default
//     host could be ASIO if compiled in, which doesn't support loopback.
//   * Path branches on `is_loopback`:
//       - Input device: `default_input_config()` → format + StreamConfig
//         → `build_input_stream_raw`.
//       - Output device used as loopback: `default_output_config()` →
//         format + StreamConfig → `build_input_stream_raw` on the OUTPUT
//         device. cpal applies AUDCLNT_STREAMFLAGS_LOOPBACK internally.
//   * `build_input_stream_raw` (not the typed variants) so we can handle
//     any SampleFormat the device reports without hardcoding which ones
//     are supported. Format dispatch happens INSIDE the callback via
//     `data.as_slice::<T>()`.
//   * In shared mode we honour the device's native sample rate / channels
//     (WASAPI shared mode enforces the system mixer format). JS-supplied
//     values are ignored with a warning if they differ.
//
// Thread layout: cpal callback (real-time) writes to a lock-free ringbuf
// + crossbeam channel. Forwarder thread reads channel, batches into
// 10 ms chunks, emits `audio:frame` Tauri events. Tauri command thread
// (tokio runtime) takes a brief mutex to start/stop, never touches the
// hot data path.
// ===========================================================================

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::{Data, SampleFormat, Stream, StreamConfig};
use ringbuf::traits::{Consumer, Producer, Split};
use ringbuf::HeapRb;
use tauri::{AppHandle, Emitter};

use super::devices::{get_host, resolve_device};
use super::{AudioConfig, AudioFramePayload};

/// Pre-roll length in milliseconds. MPC-class samplers use ~50-250 ms.
const PRE_ROLL_MS: u32 = 250;

/// Ring buffer capacity in milliseconds (must be ≥ PRE_ROLL_MS).
const RING_BUFFER_MS: u32 = 1_000;

/// Forwarder batch in milliseconds (event throttle target).
const FORWARDER_BATCH_MS: u32 = 10;

pub struct AudioEngineState {
    pub engine: Mutex<Option<AudioEngine>>,
}

impl AudioEngineState {
    pub fn new() -> Self {
        Self {
            engine: Mutex::new(None),
        }
    }
}

impl Default for AudioEngineState {
    fn default() -> Self {
        Self::new()
    }
}

#[allow(dead_code)]
pub struct AudioEngine {
    config: AudioConfig,
    _input_stream: Stream,
    recording_flag: Arc<AtomicBool>,
    peak_level: Arc<AtomicU32>,
    recording_buffer: Arc<Mutex<Vec<f32>>>,
    pre_roll_consumer_handle: Arc<Mutex<Option<PreRollConsumerHandle>>>,
    sample_rate: u32,
    channels: u16,
}

// cpal::Stream is !Send on Windows (WASAPI handles are thread-bound). We
// never move streams between threads — all Tauri commands run on the
// tokio runtime and the audio data path uses lock-free ring buffer +
// crossbeam channel, both Send.
unsafe impl Send for AudioEngine {}

struct PreRollConsumerHandle {
    consumer: ringbuf::HeapCons<f32>,
}

impl AudioEngine {
    pub fn start(app_handle: AppHandle, config: AudioConfig) -> Result<Self, String> {
        // Suppress unused warning when not on Windows; we read the host
        // name inside the eprintln.
        let host = get_host();
        eprintln!(
            "[audio] host: {:?}",
            host.id()
        );

        let device_id = config
            .input_device_id
            .clone()
            .or_else(super::devices::default_input_id)
            .ok_or_else(|| "no input device available".to_string())?;
        eprintln!("[audio] requested device id: {device_id}");

        let (device, is_loopback) = resolve_device(&device_id)?;
        let device_name = device.name().unwrap_or_else(|_| "<unnamed>".into());
        eprintln!(
            "[audio] resolved device: {device_name} (loopback={is_loopback})"
        );

        // Pick the device's native format. In shared WASAPI mode this is
        // what the device will actually deliver — overriding sample rate
        // / channels in shared mode is rejected by the OS. We honour the
        // native values and log a warning if JS asked for something else.
        let supported_config = if is_loopback {
            device
                .default_output_config()
                .map_err(|e| format!("default_output_config (loopback): {e}"))?
        } else {
            device
                .default_input_config()
                .map_err(|e| format!("default_input_config: {e}"))?
        };

        let sample_format = supported_config.sample_format();
        let stream_config: StreamConfig = supported_config.config();
        let sample_rate = stream_config.sample_rate.0;
        let channels = stream_config.channels;

        eprintln!(
            "[audio] device default config: sample_rate={} channels={} format={:?} buffer={:?}",
            sample_rate, channels, sample_format, stream_config.buffer_size
        );
        eprintln!(
            "[audio] JS requested config: sample_rate={} channels={} buffer={}",
            config.sample_rate, config.channels, config.buffer_size
        );
        if config.sample_rate != sample_rate || config.channels != channels {
            eprintln!(
                "[audio] WARN: JS-requested format differs from device native. WASAPI shared mode enforces native — using {} Hz / {} ch.",
                sample_rate, channels
            );
        }

        // Pre-roll ring: 1 s at native rate * channels, rounded up to
        // power-of-2 (ringbuf::HeapRb requires this).
        let ring_capacity =
            next_power_of_two(((sample_rate * channels as u32 * RING_BUFFER_MS) / 1000) as usize);
        let ring: HeapRb<f32> = HeapRb::new(ring_capacity);
        let (producer, consumer) = ring.split();

        let recording_flag = Arc::new(AtomicBool::new(false));
        let peak_level = Arc::new(AtomicU32::new(0));
        let recording_buffer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));

        let (event_tx, event_rx) = crossbeam_channel::unbounded::<Vec<f32>>();

        let recording_flag_cb = Arc::clone(&recording_flag);
        let peak_level_cb = Arc::clone(&peak_level);
        let mut producer_cb = producer;
        let event_tx_cb = event_tx.clone();

        // Build raw-format stream. `Data` is cpal's untyped wrapper; we
        // dispatch on the device-reported SampleFormat inside the closure.
        let err_fn = |err| eprintln!("[audio] stream error: {err}");

        let input_stream = device
            .build_input_stream_raw(
                &stream_config,
                sample_format,
                move |data: &Data, _info: &cpal::InputCallbackInfo| {
                    process_callback(
                        data,
                        sample_format,
                        &mut producer_cb,
                        &recording_flag_cb,
                        &peak_level_cb,
                        &event_tx_cb,
                    );
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("build_input_stream_raw: {e}"))?;

        eprintln!("[audio] build_input_stream_raw OK");

        input_stream
            .play()
            .map_err(|e| format!("stream.play: {e}"))?;
        eprintln!("[audio] stream.play OK — capture is running");

        // Forwarder thread: drains the channel into the recording
        // accumulator + emits Tauri events. Lives until event_tx is
        // dropped (engine shutdown).
        let recording_buffer_fwd = Arc::clone(&recording_buffer);
        let app_handle_fwd = app_handle.clone();
        let channels_fwd = channels;
        let sample_rate_fwd = sample_rate;
        std::thread::spawn(move || {
            forwarder_loop(
                event_rx,
                recording_buffer_fwd,
                app_handle_fwd,
                sample_rate_fwd,
                channels_fwd,
            );
        });

        Ok(AudioEngine {
            config,
            _input_stream: input_stream,
            recording_flag,
            peak_level,
            recording_buffer,
            pre_roll_consumer_handle: Arc::new(Mutex::new(Some(PreRollConsumerHandle {
                consumer,
            }))),
            sample_rate,
            channels,
        })
    }

    pub fn start_recording(&self) -> Result<(), String> {
        let _ = self.recording_flag.swap(true, Ordering::SeqCst);

        let mut buffer = self
            .recording_buffer
            .lock()
            .map_err(|e| format!("recording_buffer lock: {e}"))?;
        buffer.clear();

        let pre_roll_samples =
            (self.sample_rate as usize * self.channels as usize * PRE_ROLL_MS as usize) / 1000;

        let mut handle_guard = self
            .pre_roll_consumer_handle
            .lock()
            .map_err(|e| format!("pre_roll_consumer lock: {e}"))?;

        if let Some(handle) = handle_guard.as_mut() {
            let mut staged: Vec<f32> = Vec::with_capacity(pre_roll_samples);
            while let Some(sample) = handle.consumer.try_pop() {
                staged.push(sample);
            }
            if staged.len() > pre_roll_samples {
                let skip = staged.len() - pre_roll_samples;
                buffer.extend_from_slice(&staged[skip..]);
            } else {
                buffer.extend_from_slice(&staged);
            }
            eprintln!(
                "[audio] start_recording: pre-roll seeded {} samples ({} requested)",
                buffer.len(),
                pre_roll_samples
            );
        }

        Ok(())
    }

    pub fn stop_recording(&self) -> Result<Vec<f32>, String> {
        self.recording_flag.store(false, Ordering::SeqCst);
        let mut buffer = self
            .recording_buffer
            .lock()
            .map_err(|e| format!("recording_buffer lock: {e}"))?;
        let captured = std::mem::take(&mut *buffer);
        eprintln!("[audio] stop_recording: {} samples captured", captured.len());
        Ok(captured)
    }

    pub fn current_level(&self) -> f32 {
        f32::from_bits(self.peak_level.swap(0, Ordering::Relaxed))
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn channels(&self) -> u16 {
        self.channels
    }

    #[allow(dead_code)]
    pub fn config(&self) -> &AudioConfig {
        &self.config
    }
}

/// Per-callback work. Format dispatched at runtime; the ringbuf push +
/// peak update + (conditional) event-channel send all happen here.
fn process_callback(
    data: &Data,
    sample_format: SampleFormat,
    producer: &mut ringbuf::HeapProd<f32>,
    recording_flag: &AtomicBool,
    peak_level: &AtomicU32,
    event_tx: &crossbeam_channel::Sender<Vec<f32>>,
) {
    let recording = recording_flag.load(Ordering::Relaxed);
    let mut peak = 0f32;

    match sample_format {
        SampleFormat::F32 => {
            let samples = match data.as_slice::<f32>() {
                Some(s) => s,
                None => return,
            };
            for &s in samples {
                let _ = producer.try_push(s);
                let a = s.abs();
                if a > peak {
                    peak = a;
                }
            }
            if recording {
                let _ = event_tx.try_send(samples.to_vec());
            }
        }
        SampleFormat::I16 => {
            let samples = match data.as_slice::<i16>() {
                Some(s) => s,
                None => return,
            };
            let mut converted: Vec<f32> = if recording {
                Vec::with_capacity(samples.len())
            } else {
                Vec::new()
            };
            for &s in samples {
                let f = s as f32 / 32_768.0;
                let _ = producer.try_push(f);
                let a = f.abs();
                if a > peak {
                    peak = a;
                }
                if recording {
                    converted.push(f);
                }
            }
            if recording {
                let _ = event_tx.try_send(converted);
            }
        }
        SampleFormat::U16 => {
            let samples = match data.as_slice::<u16>() {
                Some(s) => s,
                None => return,
            };
            let mut converted: Vec<f32> = if recording {
                Vec::with_capacity(samples.len())
            } else {
                Vec::new()
            };
            for &s in samples {
                let f = (s as f32 - 32_768.0) / 32_768.0;
                let _ = producer.try_push(f);
                let a = f.abs();
                if a > peak {
                    peak = a;
                }
                if recording {
                    converted.push(f);
                }
            }
            if recording {
                let _ = event_tx.try_send(converted);
            }
        }
        SampleFormat::I32 => {
            let samples = match data.as_slice::<i32>() {
                Some(s) => s,
                None => return,
            };
            let mut converted: Vec<f32> = if recording {
                Vec::with_capacity(samples.len())
            } else {
                Vec::new()
            };
            for &s in samples {
                let f = s as f32 / 2_147_483_648.0;
                let _ = producer.try_push(f);
                let a = f.abs();
                if a > peak {
                    peak = a;
                }
                if recording {
                    converted.push(f);
                }
            }
            if recording {
                let _ = event_tx.try_send(converted);
            }
        }
        other => {
            static WARNED: AtomicBool = AtomicBool::new(false);
            if !WARNED.swap(true, Ordering::Relaxed) {
                eprintln!("[audio] WARN: unsupported sample format {:?} — dropping frames", other);
            }
            return;
        }
    }

    update_peak(peak_level, peak);
}

fn update_peak(peak_level: &AtomicU32, new_peak: f32) {
    let mut current = peak_level.load(Ordering::Relaxed);
    loop {
        let current_f = f32::from_bits(current);
        if new_peak <= current_f {
            return;
        }
        match peak_level.compare_exchange_weak(
            current,
            new_peak.to_bits(),
            Ordering::Relaxed,
            Ordering::Relaxed,
        ) {
            Ok(_) => return,
            Err(actual) => current = actual,
        }
    }
}

fn forwarder_loop(
    rx: crossbeam_channel::Receiver<Vec<f32>>,
    recording_buffer: Arc<Mutex<Vec<f32>>>,
    app_handle: AppHandle,
    sample_rate: u32,
    channels: u16,
) {
    let batch_target =
        (sample_rate as usize * channels as usize * FORWARDER_BATCH_MS as usize) / 1000;
    let mut batch: Vec<f32> = Vec::with_capacity(batch_target);

    while let Ok(chunk) = rx.recv() {
        batch.extend_from_slice(&chunk);
        if batch.len() >= batch_target {
            flush_batch(&mut batch, &recording_buffer, &app_handle, sample_rate, channels);
        }
    }
    if !batch.is_empty() {
        flush_batch(&mut batch, &recording_buffer, &app_handle, sample_rate, channels);
    }
}

fn flush_batch(
    batch: &mut Vec<f32>,
    recording_buffer: &Arc<Mutex<Vec<f32>>>,
    app_handle: &AppHandle,
    sample_rate: u32,
    channels: u16,
) {
    if let Ok(mut buf) = recording_buffer.lock() {
        buf.extend_from_slice(batch);
    }
    let payload = AudioFramePayload {
        samples: std::mem::take(batch),
        channels,
        sample_rate,
    };
    let _ = app_handle.emit("audio:frame", payload);
}

fn next_power_of_two(n: usize) -> usize {
    if n.is_power_of_two() {
        n
    } else {
        n.next_power_of_two()
    }
}
