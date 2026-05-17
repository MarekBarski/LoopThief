import { AppShell } from "./components/layout/AppShell";
import { KeyboardShortcuts } from "./components/workstation/KeyboardShortcuts";

export function App() {
  return (
    <>
      <KeyboardShortcuts />
      <AppShell />
    </>
  );
}
