import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface TerminalInstance {
  id: string;
  title: string;
  cwd: string;
  isAlive: boolean;
}

export type PanelPosition = "bottom" | "right";

interface ITerminalState {
  panelOpen: boolean;
  panelPosition: PanelPosition;
  panelHeight: number;
  panelWidth: number;
  instances: TerminalInstance[];
  activeId: string | null;
  moduleInitialized: boolean;
}

interface ITerminalActions {
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  setPanelPosition: (position: PanelPosition) => void;
  setPanelHeight: (height: number) => void;
  setPanelWidth: (width: number) => void;
  addInstance: (instance: TerminalInstance) => void;
  removeInstance: (id: string) => void;
  setActiveId: (id: string) => void;
  markInstanceDead: (id: string) => void;
  updateInstanceTitle: (id: string, title: string) => void;
  setModuleInitialized: (initialized: boolean) => void;
}

const useTerminalStore = create<ITerminalState & ITerminalActions>()(
  persist(
    (set) => ({
      panelOpen: false,
      panelPosition: "bottom",
      panelHeight: 250,
      panelWidth: 400,
      instances: [],
      activeId: null,
      moduleInitialized: false,

      togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
      setPanelOpen: (open) => set({ panelOpen: open }),
      setPanelPosition: (position) => set({ panelPosition: position }),
      setPanelHeight: (height) => set({ panelHeight: height }),
      setPanelWidth: (width) => set({ panelWidth: width }),

      addInstance: (instance) =>
        set((state) => ({
          instances: [...state.instances, instance],
          activeId: instance.id,
        })),

      removeInstance: (id) =>
        set((state) => {
          const instances = state.instances.filter((i) => i.id !== id);
          let activeId = state.activeId;
          if (activeId === id) {
            activeId =
              instances.length > 0 ? instances[instances.length - 1].id : null;
          }
          const panelOpen = instances.length > 0 ? state.panelOpen : false;
          return { instances, activeId, panelOpen };
        }),

      setActiveId: (id) => set({ activeId: id }),

      markInstanceDead: (id) =>
        set((state) => ({
          instances: state.instances.map((i) =>
            i.id === id ? { ...i, isAlive: false } : i,
          ),
        })),

      updateInstanceTitle: (id, title) =>
        set((state) => ({
          instances: state.instances.map((i) =>
            i.id === id ? { ...i, title } : i,
          ),
        })),

      setModuleInitialized: (initialized) =>
        set({ moduleInitialized: initialized }),
    }),
    {
      name: "terminal-panel",
      partialize: (state) => ({
        panelOpen: state.panelOpen,
        panelPosition: state.panelPosition,
        panelHeight: state.panelHeight,
        panelWidth: state.panelWidth,
      }),
    },
  ),
);

export default useTerminalStore;
