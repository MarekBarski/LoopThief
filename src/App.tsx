import { useEffect } from "react";
import { AppShell } from "./components/layout/AppShell";
import { KeyboardShortcuts } from "./components/workstation/KeyboardShortcuts";
import { RuntimeClock } from "./components/workstation/RuntimeClock";
import { useAppStore } from "./store/useAppStore";

export function App() {
  const preloadAudioBuffers = useAppStore((state) => state.preloadAudioBuffers);
  useEffect(() => {
    preloadAudioBuffers();
  }, [preloadAudioBuffers]);

  return (
    <>
      <KeyboardShortcuts />
      <RuntimeClock />
      <AppShell />
    </>
  );
}
