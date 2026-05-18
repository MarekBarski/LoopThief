import { useEffect } from "react";
import { useAppStore } from "../../store/useAppStore";

export function RuntimeClock() {
  const isPlaying = useAppStore((state) => state.isPlaying);
  const bpm = useAppStore((state) => state.bpm);
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

  return null;
}
