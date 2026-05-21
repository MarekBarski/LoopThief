import { useEffect, useState } from "react";
import { isTauri } from "../../runtime/environment";

/**
 * Browser-only viewport warning. Tauri enforces window.minWidth/minHeight
 * as a hard floor via `tauri.conf.json`, so this banner is suppressed when
 * running inside the Tauri shell.
 */
const MIN_WIDTH = 1280;
const MIN_HEIGHT = 720;

export function ViewportWarning() {
  const [viewport, setViewport] = useState({
    width: typeof window === "undefined" ? Infinity : window.innerWidth,
    height: typeof window === "undefined" ? Infinity : window.innerHeight,
  });

  useEffect(() => {
    const handler = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  if (isTauri()) return null;

  const tooSmall = viewport.width < MIN_WIDTH || viewport.height < MIN_HEIGHT;
  if (!tooSmall) return null;

  return (
    <div
      role="alert"
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] flex justify-center p-[10px]"
    >
      <div className="pointer-events-auto max-w-[640px] rounded-sm border border-amber-300/70 bg-[#0a0d08]/95 px-[14px] py-[8px] text-[12px] tracking-[0.12em] text-amber-100 shadow-lg">
        <p>
          Viewport {viewport.width}×{viewport.height} is below the recommended {MIN_WIDTH}×{MIN_HEIGHT}.
        </p>
        <p className="mt-[2px] text-[#d8e3b7]">
          Enlarge the window or install the desktop build (.exe) for guaranteed sizing.
        </p>
      </div>
    </div>
  );
}
