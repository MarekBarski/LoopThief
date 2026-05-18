import { AppShell } from "./components/layout/AppShell";
import { KeyboardShortcuts } from "./components/workstation/KeyboardShortcuts";
import { RuntimeClock } from "./components/workstation/RuntimeClock";

export function App() {
  return (
    <>
      <KeyboardShortcuts />
      <RuntimeClock />
      <AppShell />
    </>
  );
}
