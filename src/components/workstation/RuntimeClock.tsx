import { useEffect } from "react";
import { useAppStore } from "../../store/useAppStore";
import { emitMidiClockFromStore } from "../../store/useAppStore";

export function RuntimeClock() {
  const isPlaying = useAppStore((state) => state.isPlaying);
  const bpm = useAppStore((state) => state.bpm);
  const midiSyncOut = useAppStore((state) => state.settingsValues.midiSyncOut);
  const midiOutputDeviceId = useAppStore((state) => state.settingsValues.midiOutputDeviceId);
  const tickStepPlayback = useAppStore((state) => state.tickStepPlayback);
  const tickPerformance = useAppStore((state) => state.tickPerformance);
  const tickSongPlayback = useAppStore((state) => state.tickSongPlayback);
  const tickTransport = useAppStore((state) => state.tickTransport);

  useEffect(() => {
    const interval = window.setInterval(() => tickTransport(25), 25);
    return () => window.clearInterval(interval);
  }, [tickTransport]);

  useEffect(() => {
    if (!isPlaying) return;
    const sixteenthMs = 60_000 / bpm / 4;
    const interval = window.setInterval(() => {
      tickStepPlayback();
      tickPerformance();
    }, sixteenthMs);
    return () => window.clearInterval(interval);
  }, [bpm, isPlaying, tickPerformance, tickStepPlayback]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => tickSongPlayback(), 500);
    return () => window.clearInterval(interval);
  }, [isPlaying, tickSongPlayback]);

  // MIDI clock out — 24 PPQ when playing AND sync-out CLOCK selected AND
  // output device chosen. Sends just clock bytes; Start/Stop come from the
  // togglePlay/stopPlayback actions in the store.
  useEffect(() => {
    if (!isPlaying || midiSyncOut !== "CLOCK" || !midiOutputDeviceId) return;
    const tickMs = 60_000 / bpm / 24;
    const interval = window.setInterval(() => emitMidiClockFromStore(), tickMs);
    return () => window.clearInterval(interval);
  }, [bpm, isPlaying, midiSyncOut, midiOutputDeviceId]);

  return null;
}
