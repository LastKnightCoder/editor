import { create } from "zustand";
import { produce } from "immer";
import { PomodoroPreset, PomodoroSession } from "@/types";

interface PomodoroState {
  presets: PomodoroPreset[];
  active: PomodoroSession | null;
  setPresets: (presets: PomodoroPreset[]) => void;
  setActive: (s: PomodoroSession | null) => void;
}

export const usePomodoroStore = create<PomodoroState>((set) => ({
  presets: [],
  active: null,
  setPresets: (presets) =>
    set(
      produce((draft: PomodoroState) => {
        draft.presets = presets;
      }),
    ),
  setActive: (s) =>
    set(
      produce((draft: PomodoroState) => {
        draft.active = s;
      }),
    ),
}));
