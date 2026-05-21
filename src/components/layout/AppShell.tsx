import { useEffect, useMemo, useRef, useState } from "react";
import mainPanelBg from "../../../assets/ui/panels/main_panel_bg_1920_v3.png";
import { useLayoutStore } from "../../store/useLayoutStore";
import { LayoutEditorOverlay } from "./LayoutEditorOverlay";
import { LayoutElements } from "./LayoutElements";
import { isTauri } from "../../runtime/environment";

export const CANVAS_WIDTH = 2527;
export const CANVAS_HEIGHT = 1610;

export function AppShell() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const setEditMode = useLayoutStore((state) => state.setEditMode);

  useEffect(() => {
    const updateScale = () => {
      const availableWidth = window.innerWidth - 24;
      const availableHeight = window.innerHeight - 24;
      setScale(Math.min(availableWidth / CANVAS_WIDTH, availableHeight / CANVAS_HEIGHT, 1));
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  // Layout editor is dev-only — disabled inside Tauri so the shipping .exe
  // can't accidentally enter edit mode (no F7 toggle, no overlay rendered).
  const layoutEditorEnabled = !isTauri();

  useEffect(() => {
    if (!layoutEditorEnabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // F7 toggles layout editor mode (moved from F2 so F2 can be a normal softkey passthrough).
      if (event.key === "F7") {
        event.preventDefault();
        setEditMode(!useLayoutStore.getState().editMode);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [layoutEditorEnabled, setEditMode]);

  const shellStyle = useMemo(
    () => ({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      transform: `scale(${scale})`,
      transformOrigin: "center center",
    }),
    [scale],
  );

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] p-3 text-zinc-100">
      <section
        ref={canvasRef}
        className="relative shrink-0 overflow-hidden"
        style={shellStyle}
      >
        <img
          src={mainPanelBg}
          alt=""
          className="pointer-events-none absolute left-0 top-0 h-full w-full select-none"
        />
        <LayoutElements />
        {layoutEditorEnabled && <LayoutEditorOverlay canvasRef={canvasRef} />}
      </section>
    </main>
  );
}
