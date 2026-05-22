export type RecordingInputSource = "MIC" | "SYSTEM" | "DEFAULT";

export type ActiveRecordingCapture = {
  stop: () => Promise<Blob>;
  cancel: () => void;
};

/**
 * Unified capture session abstraction. Used by the store to drive both the
 * browser (MediaRecorder → Blob) and the native (cpal/WASAPI → AudioBuffer)
 * paths through one type. Native already returns AudioBuffer directly;
 * browser wraps decode inside `stop()`.
 */
export type UnifiedCaptureSession = {
  stop: () => Promise<AudioBuffer>;
  cancel: () => Promise<void>;
  /**
   * Native sessions know their sample rate / channels up front. Browser
   * sessions discover it during decode; the field is optional and only
   * filled when meaningful.
   */
  sampleRate?: number;
};

export async function startRecordingCapture(
  source: RecordingInputSource,
  onLevel: (level: number) => void,
): Promise<ActiveRecordingCapture> {
  const stream = await openCaptureStream(source);
  const recorder = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  const mediaSource = context.createMediaStreamSource(stream);
  mediaSource.connect(analyser);

  let active = true;
  const samples = new Uint8Array(analyser.fftSize);
  const tickLevel = () => {
    if (!active) return;
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }
    onLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
    window.requestAnimationFrame(tickLevel);
  };

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const cleanup = () => {
    active = false;
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
    onLevel(0);
  };

  recorder.start(100);
  tickLevel();

  return {
    stop: () =>
      new Promise((resolve, reject) => {
        recorder.onerror = () => {
          cleanup();
          reject(new Error("Recording failed"));
        };
        recorder.onstop = () => {
          cleanup();
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        };
        if (recorder.state === "inactive") {
          cleanup();
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
          return;
        }
        recorder.stop();
      }),
    cancel: () => {
      if (recorder.state !== "inactive") recorder.stop();
      cleanup();
    },
  };
}

async function openCaptureStream(source: RecordingInputSource) {
  if (source === "SYSTEM") {
    const displayMedia = navigator.mediaDevices.getDisplayMedia;
    if (!displayMedia) throw new Error("System capture unavailable");
    const stream = await displayMedia.call(navigator.mediaDevices, { audio: true, video: true });
    stream.getVideoTracks().forEach((track) => track.stop());
    if (stream.getAudioTracks().length === 0) throw new Error("No system audio track");
    return stream;
  }

  return navigator.mediaDevices.getUserMedia({
    audio: source === "DEFAULT" ? true : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
}

