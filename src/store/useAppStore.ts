import { create } from "zustand";
import type { ScreenId } from "../types/navigation";

type AppState = {
  activeScreen: ScreenId;
  setActiveScreen: (screen: ScreenId) => void;
};

export const useAppStore = create<AppState>((set) => ({
  activeScreen: "MAIN",
  setActiveScreen: (activeScreen) => set({ activeScreen }),
}));
