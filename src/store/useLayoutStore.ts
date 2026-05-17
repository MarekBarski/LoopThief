import { create } from "zustand";
import initialLayout from "../layout/layout.json";
import type { LayoutDocument, LayoutElement } from "../types/layout";

type LayoutState = {
  elements: LayoutElement[];
  editMode: boolean;
  selectedIds: string[];
  setEditMode: (value: boolean) => void;
  setSelectedIds: (ids: string[]) => void;
  toggleSelectedId: (id: string) => void;
  updateElement: (id: string, patch: Partial<LayoutElement>) => void;
  nudgeElement: (id: string, dx: number, dy: number) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  alignSelected:
    | ((mode: "left" | "right" | "top" | "bottom" | "centerX" | "centerY") => void)
    | undefined;
  distributeSelected: (mode: "horizontal" | "vertical") => void;
  matchSelected: (mode: "width" | "height" | "size") => void;
  serialize: () => LayoutDocument;
};

const snap = (value: number) => Math.round(value / 8) * 8;

export const useLayoutStore = create<LayoutState>((set, get) => ({
  elements: initialLayout.elements as LayoutElement[],
  editMode: false,
  selectedIds: [],
  setEditMode: (editMode) => set({ editMode, selectedIds: editMode ? get().selectedIds : [] }),
  setSelectedIds: (selectedIds) => set({ selectedIds }),
  toggleSelectedId: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedIds, id],
    })),
  updateElement: (id, patch) =>
    set((state) => ({
      elements: state.elements.map((element) =>
        element.id === id
          ? {
              ...element,
              ...patch,
              x: patch.x === undefined ? element.x : snap(patch.x),
              y: patch.y === undefined ? element.y : snap(patch.y),
              w: patch.w === undefined ? element.w : Math.max(8, snap(patch.w)),
              h: patch.h === undefined ? element.h : Math.max(8, snap(patch.h)),
            }
          : element,
      ),
    })),
  nudgeElement: (id, dx, dy) =>
    set((state) => ({
      elements: state.elements.map((element) =>
        element.id === id ? { ...element, x: element.x + dx, y: element.y + dy } : element,
      ),
    })),
  duplicateSelected: () => {
    const { elements, selectedIds } = get();
    const selected = elements.filter((element) => selectedIds.includes(element.id));
    if (!selected.length) return;

    const duplicates = selected.map((element) => {
      const copyCount =
        elements.filter((candidate) => candidate.id.startsWith(`${element.id}-copy`)).length + 1;
      return {
        ...element,
        id: `${element.id}-copy-${copyCount}`,
        x: snap(element.x + 16),
        y: snap(element.y + 16),
      };
    });

    set({
      elements: [...elements, ...duplicates],
      selectedIds: duplicates.map((element) => element.id),
    });
  },
  deleteSelected: () => {
    const { selectedIds } = get();
    if (!selectedIds.length) return;
    set((state) => ({
      elements: state.elements.filter((element) => !selectedIds.includes(element.id)),
      selectedIds: [],
    }));
  },
  alignSelected: (mode) => {
    const { elements, selectedIds } = get();
    const selected = elements.filter((element) => selectedIds.includes(element.id));
    if (selected.length < 2) return;

    const left = Math.min(...selected.map((element) => element.x));
    const right = Math.max(...selected.map((element) => element.x + element.w));
    const top = Math.min(...selected.map((element) => element.y));
    const bottom = Math.max(...selected.map((element) => element.y + element.h));
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;

    set((state) => ({
      elements: state.elements.map((element) => {
        if (!selectedIds.includes(element.id)) return element;
        if (mode === "left") return { ...element, x: left };
        if (mode === "right") return { ...element, x: right - element.w };
        if (mode === "top") return { ...element, y: top };
        if (mode === "bottom") return { ...element, y: bottom - element.h };
        if (mode === "centerX") return { ...element, x: centerX - element.w / 2 };
        return { ...element, y: centerY - element.h / 2 };
      }),
    }));
  },
  distributeSelected: (mode) => {
    const { elements, selectedIds } = get();
    const selected = elements.filter((element) => selectedIds.includes(element.id));
    if (selected.length < 3) return;

    if (mode === "horizontal") {
      const ordered = [...selected].sort((a, b) => a.x - b.x);
      const first = ordered[0];
      const last = ordered[ordered.length - 1];
      const gap = (last.x - first.x) / (ordered.length - 1);
      set((state) => ({
        elements: state.elements.map((element) => {
          const index = ordered.findIndex((candidate) => candidate.id === element.id);
          return index === -1 ? element : { ...element, x: first.x + gap * index };
        }),
      }));
      return;
    }

    const ordered = [...selected].sort((a, b) => a.y - b.y);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const gap = (last.y - first.y) / (ordered.length - 1);
    set((state) => ({
      elements: state.elements.map((element) => {
        const index = ordered.findIndex((candidate) => candidate.id === element.id);
        return index === -1 ? element : { ...element, y: first.y + gap * index };
      }),
    }));
  },
  matchSelected: (mode) => {
    const { elements, selectedIds } = get();
    const selected = elements.filter((element) => selectedIds.includes(element.id));
    if (selected.length < 2) return;
    const reference = selected[0];

    set((state) => ({
      elements: state.elements.map((element) => {
        if (!selectedIds.includes(element.id) || element.id === reference.id) return element;
        if (mode === "width") return { ...element, w: reference.w };
        if (mode === "height") return { ...element, h: reference.h };
        return { ...element, w: reference.w, h: reference.h };
      }),
    }));
  },
  serialize: () => ({ elements: get().elements }),
}));
