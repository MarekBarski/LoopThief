import { useEffect, useRef } from "react";
import { AppShell } from "./components/layout/AppShell";
import { KeyboardShortcuts } from "./components/workstation/KeyboardShortcuts";
import { RuntimeClock } from "./components/workstation/RuntimeClock";
import { useAppStore } from "./store/useAppStore";
import {
  clearAutosave,
  readAutosave,
  scheduleAutosave,
  serializeProject,
  writeProjectZip,
} from "./disk";
import { getSampleBuffer } from "./audio/sampleLibrary";

const APP_VERSION = "0.1.0";

export function App() {
  const preloadAudioBuffers = useAppStore((state) => state.preloadAudioBuffers);
  const promptedResumeRef = useRef(false);

  useEffect(() => {
    preloadAudioBuffers();
  }, [preloadAudioBuffers]);

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
