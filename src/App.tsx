import { useEffect, useRef } from "react";
import { AppShell } from "./components/layout/AppShell";
import { KeyboardShortcuts } from "./components/workstation/KeyboardShortcuts";
import { RuntimeClock } from "./components/workstation/RuntimeClock";
import { useAppStore, subscribeMidiInput } from "./store/useAppStore";
import {
  clearAutosave,
  readAutosave,
  scheduleAutosave,
  serializeProject,
  writeProjectZip,
} from "./disk";
import { getSampleBuffer } from "./audio/sampleLibrary";
import {
  isMidiSupported,
  requestMidiAccess,
  listInputs,
  listOutputs,
  onMidiStateChange,
} from "./midi";

const APP_VERSION = "0.1.0";

export function App() {
  const preloadAudioBuffers = useAppStore((state) => state.preloadAudioBuffers);
  const promptedResumeRef = useRef(false);

  useEffect(() => {
    preloadAudioBuffers();
  }, [preloadAudioBuffers]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("loopthief.settings");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        useAppStore.getState().hydrateSettings(parsed);
      }
    } catch (error) {
      console.warn("[loopthief] settings hydrate failed", error);
    }
  }, []);

  useEffect(() => {
    let lastSettings = useAppStore.getState().settingsValues;
    let pendingTimer: number | null = null;
    const unsubscribe = useAppStore.subscribe((state) => {
      if (state.settingsValues === lastSettings) return;
      lastSettings = state.settingsValues;
      if (pendingTimer !== null) window.clearTimeout(pendingTimer);
      pendingTimer = window.setTimeout(() => {
        try {
          window.localStorage.setItem("loopthief.settings", JSON.stringify(useAppStore.getState().settingsValues));
        } catch {
          /* localStorage unavailable */
        }
      }, 500);
    });
    return () => {
      if (pendingTimer !== null) window.clearTimeout(pendingTimer);
      unsubscribe();
    };
  }, []);

  // MIDI access initialization. Browsers that don't support Web MIDI keep
  // midiAvailable=false and the SETTINGS UI surfaces a "MIDI not available"
  // hint. Permission denial yields the same outcome.
  useEffect(() => {
    if (!isMidiSupported()) {
      useAppStore.getState().setMidiAvailable(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const granted = await requestMidiAccess();
      if (cancelled) return;
      useAppStore.getState().setMidiAvailable(granted);
      if (!granted) return;
      const refresh = () => {
        useAppStore.getState().setMidiInputs(listInputs());
        useAppStore.getState().setMidiOutputs(listOutputs());
        subscribeMidiInput();
      };
      refresh();
      onMidiStateChange(refresh);
    })();
    return () => {
      cancelled = true;
      onMidiStateChange(null);
    };
  }, []);

  // Resubscribe to the input device whenever the user changes selection.
  useEffect(() => {
    let lastInputId = useAppStore.getState().settingsValues.midiInputDeviceId;
    const unsubscribe = useAppStore.subscribe((state) => {
      const currentId = state.settingsValues.midiInputDeviceId;
      if (currentId === lastInputId) return;
      lastInputId = currentId;
      subscribeMidiInput();
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (promptedResumeRef.current) return;
    promptedResumeRef.current = true;
    void (async () => {
      try {
        const blob = await readAutosave();
        if (!blob) return;
        const shouldResume = window.confirm(
          "LoopThief found an autosaved session from a previous run.\n\nResume previous session?\n\nOK = Resume   |   Cancel = Start blank",
        );
        if (!shouldResume) {
          await clearAutosave();
          return;
        }
        await useAppStore.getState().loadFile(blob);
      } catch (error) {
        console.warn("[loopthief] autosave resume failed", error);
      }
    })();
  }, []);

  useEffect(() => {
    let lastVersion = useAppStore.getState().projectVersion;
    const unsubscribe = useAppStore.subscribe((state) => {
      if (state.projectVersion === lastVersion) return;
      lastVersion = state.projectVersion;
      scheduleAutosave(async () => {
          const state = useAppStore.getState();
          const { manifest, sampleEntries } = serializeProject({
            name: "autosave",
            appVersion: APP_VERSION,
            samples: state.recordedSamples.map((sample) => ({
              id: sample.id,
              name: sample.name,
              audioBufferId: sample.audioBufferId,
              durationMs: sample.durationMs,
              duration: sample.duration,
              sampleRate: sample.sampleRate,
              channelCount: sample.channelCount,
              waveform: sample.waveform,
              keptSlices: sample.keptSlices,
              editState: sample.editState,
            })),
            programs: state.programs,
            sequences: state.sequences,
            songs: state.songSteps,
            globalSettings: {
              bpm: state.bpm,
              swing: state.swing,
              timingCorrect: state.timingCorrect,
              tripletMode: state.tripletMode,
              timeSignature: state.timeSignature,
              sequenceLengthBars: state.sequenceLengthBars,
              metronomeEnabled: state.metronomeEnabled,
              metronomeDuringRecord: state.metronomeDuringRecord,
              metronomeCountInBars: state.metronomeCountInBars,
              metronomeVolume: state.metronomeVolume,
            },
            fxBuses: state.fxBuses,
            masterFx: state.masterFx,
            fxChainFX1ToFX2: state.fxChainFX1ToFX2,
            fxChainFX3ToFX4: state.fxChainFX3ToFX4,
            resolveAudioBuffer: (id) => getSampleBuffer(id),
          });
          return writeProjectZip(manifest, sampleEntries);
        });
    });
    return unsubscribe;
  }, []);

  return (
    <>
      <KeyboardShortcuts />
      <RuntimeClock />
      <AppShell />
    </>
  );
}
