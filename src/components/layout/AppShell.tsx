import { useEffect, useMemo, useRef, useState } from "react";
import mainPanelBg from "../../../assets/ui/panels/main_panel_bg_1920_v2.png";
import { useLayoutStore } from "../../store/useLayoutStore";
import { LayoutEditorOverlay } from "./LayoutEditorOverlay";
import { LayoutElements } from "./LayoutElements";

export const CANVAS_WIDTH = 2859;
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        setEditMode(!useLayoutStore.getState().editMode);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setEditMode]);

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
        className="relative overflow-hidden"
        style={shellStyle}
      >
        <img
          src={mainPanelBg}
          alt=""
          className="pointer-events-none absolute left-0 top-0 h-[1610px] w-[2859px] select-none"
          style={{ objectFit: "fill" }}
        />
        <LayoutElements />
        <LayoutEditorOverlay canvasRef={canvasRef} />
      </section>
    </main>
  );
}
