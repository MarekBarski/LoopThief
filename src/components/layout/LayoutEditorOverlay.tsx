import { useEffect, useRef, useState } from "react";
import { useLayoutStore } from "../../store/useLayoutStore";
import type { LayoutElement } from "../../types/layout";

type DragState =
  | { kind: "move"; id: string; startX: number; startY: number; origin: LayoutElement }
  | { kind: "resize"; id: string; startX: number; startY: number; origin: LayoutElement }
  | null;

export function LayoutEditorOverlay({ canvasRef }: { canvasRef: React.RefObject<HTMLDivElement | null> }) {
  const editMode = useLayoutStore((state) => state.editMode);
  const elements = useLayoutStore((state) => state.elements);
  const selectedIds = useLayoutStore((state) => state.selectedIds);
  const setSelectedIds = useLayoutStore((state) => state.setSelectedIds);
  const toggleSelectedId = useLayoutStore((state) => state.toggleSelectedId);
  const updateElement = useLayoutStore((state) => state.updateElement);
  const nudgeElement = useLayoutStore((state) => state.nudgeElement);
  const duplicateSelected = useLayoutStore((state) => state.duplicateSelected);
  const deleteSelected = useLayoutStore((state) => state.deleteSelected);
  const alignSelected = useLayoutStore((state) => state.alignSelected);
  const distributeSelected = useLayoutStore((state) => state.distributeSelected);
  const matchSelected = useLayoutStore((state) => state.matchSelected);
  const serialize = useLayoutStore((state) => state.serialize);
  const dragState = useRef<DragState>(null);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    const onKeyDown = async (event: KeyboardEvent) => {
      const selected = elements.filter((element) => selectedIds.includes(element.id));

      if (!useLayoutStore.getState().editMode) return;

      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        try {
          const response = await fetch("/__layout/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(serialize(), null, 2),
          });
          setSaveState(response.ok ? "saved" : "error");
        } catch {
          setSaveState("error");
        }
      }

      if (event.ctrlKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      }

      if (event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "l") alignSelected?.("left");
        if (key === "r") alignSelected?.("right");
        if (key === "t") alignSelected?.("top");
        if (key === "b") alignSelected?.("bottom");
        if (key === "h") distributeSelected("horizontal");
        if (key === "v") distributeSelected("vertical");
        if (key === "w") matchSelected("width");
        if (key === "s") matchSelected("size");
      }

      if (!selected.length) return;

      const step = event.shiftKey ? 8 : 1;
      selected.forEach((element) => {
        if (event.key === "ArrowLeft") nudgeElement(element.id, -step, 0);
        if (event.key === "ArrowRight") nudgeElement(element.id, step, 0);
        if (event.key === "ArrowUp") nudgeElement(element.id, 0, -step);
        if (event.key === "ArrowDown") nudgeElement(element.id, 0, step);
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    alignSelected,
    deleteSelected,
    distributeSelected,
    duplicateSelected,
    elements,
    matchSelected,
    nudgeElement,
    selectedIds,
    serialize,
  ]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragState.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = 2859 / rect.width;
      const scaleY = 1610 / rect.height;
      const deltaX = (event.clientX - drag.startX) * scaleX;
      const deltaY = (event.clientY - drag.startY) * scaleY;

      if (drag.kind === "move") {
        updateElement(drag.id, {
          x: drag.origin.x + deltaX,
          y: drag.origin.y + deltaY,
        });
      } else {
        updateElement(drag.id, {
          w: drag.origin.w + deltaX,
          h: drag.origin.h + deltaY,
        });
      }
    };

    const onPointerUp = () => {
      dragState.current = null;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [canvasRef, updateElement]);

  if (!editMode) return null;

  const selected = elements.filter((element) => selectedIds.includes(element.id));

  return (
    <>
      {elements.map((element) => {
        const isSelected = selectedIds.includes(element.id);
        return (
          <div
            key={element.id}
            className={`absolute border ${isSelected ? "border-cyan-300" : "border-cyan-300/40"}`}
            style={{ left: element.x, top: element.y, width: element.w, height: element.h }}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (event.shiftKey) {
                toggleSelectedId(element.id);
                return;
              }
              setSelectedIds([element.id]);
              dragState.current = {
                kind: "move",
                id: element.id,
                startX: event.clientX,
                startY: event.clientY,
                origin: { ...element },
              };
            }}
          >
            {isSelected &&
              ["-top-2 -left-2", "-top-2 -right-2", "-bottom-2 -left-2", "-bottom-2 -right-2"].map(
                (positionClass) => (
                  <button
                    key={positionClass}
                    type="button"
                    className={`absolute h-4 w-4 border border-cyan-200 bg-cyan-400 ${positionClass}`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      dragState.current = {
                        kind: "resize",
                        id: element.id,
                        startX: event.clientX,
                        startY: event.clientY,
                        origin: { ...element },
                      };
                    }}
                  />
                ),
              )}
          </div>
        );
      })}

      {selected.length > 0 && (
        <div className="absolute left-4 top-4 z-50 border border-cyan-300 bg-black/80 px-3 py-2 text-xs tracking-[0.12em] text-cyan-100">
          {selected.length === 1
            ? `${selected[0].id} · X ${selected[0].x} · Y ${selected[0].y} · W ${selected[0].w} · H ${selected[0].h}`
            : `${selected.length} elements selected`}
          {saveState === "saved" && <span className="ml-3 text-emerald-300">SAVED</span>}
          {saveState === "error" && <span className="ml-3 text-red-300">SAVE ERROR</span>}
        </div>
      )}
    </>
  );
}
