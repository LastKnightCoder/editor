import { create } from "zustand";
import { persist } from "zustand/middleware";

type Panel = "outline" | "shelf";

interface DockPreferences {
  panel: Panel | null;
  widths: Record<Panel, number>;
}

interface DockState extends DockPreferences {
  toggle(panel: Panel): void;
  setWidth(panel: Panel, width: number): void;
}

const defaultWidths = { outline: 260, shelf: 264 };

function legacyShelfPanel(): Panel | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("tau-whiteboard-shelf");
    return raw && JSON.parse(raw)?.state?.open === true ? "shelf" : null;
  } catch (error) {
    console.warn("读取旧白板素材架偏好失败", error);
    return null;
  }
}

export const useWhiteboardDockStore = create<DockState>()(
  persist(
    set => ({
      panel: legacyShelfPanel(),
      widths: defaultWidths,
      toggle: panel => set(state => ({ panel: state.panel === panel ? null : panel })),
      setWidth: (panel, width) => set(state => ({ widths: { ...state.widths, [panel]: width } })),
    }),
    {
      name: "tau-whiteboard-outline",
      version: 2,
      partialize: ({ panel, widths }): DockPreferences => ({ panel, widths }),
      migrate: (previous): DockPreferences => {
        const outline = previous as { open?: boolean; width?: number } | null;
        return {
          panel: outline?.open ? "outline" : legacyShelfPanel(),
          widths: {
            ...defaultWidths,
            outline:
              typeof outline?.width === "number" && Number.isFinite(outline.width)
                ? outline.width
                : defaultWidths.outline,
          },
        };
      },
    }
  )
);
