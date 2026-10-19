import { create } from "zustand";
import { on, off, isElectron } from "@/electron";
import useSettingStore from "@/stores/useSettingStore";
import { openPluginImages } from "./plugin-images";

interface ImageCapabilities {
  canGenerate: boolean;
  canEdit: boolean;
  error?: string;
}

export const useImageCapabilities = create<ImageCapabilities>(() => ({
  canGenerate: false,
  canEdit: false,
}));

export function startImageCapabilities() {
  if (!isElectron) return () => {};
  let generation = 0;
  let controller: AbortController | undefined;
  const refresh = () => {
    const current = ++generation;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const { providers, currentProviderId } = useSettingStore.getState().setting.imageGeneration;
    const setting = providers.find(item => item.id === currentProviderId);
    useImageCapabilities.setState({ canGenerate: false, canEdit: false, error: undefined });
    if (!setting) return;
    void (async () => {
      const instance = await openPluginImages(setting, signal);
      try {
        signal.throwIfAborted();
        if (generation === current)
          useImageCapabilities.setState({
            canGenerate: instance.canGenerate,
            canEdit: instance.canEdit,
            error: undefined,
          });
      } finally {
        await instance.dispose();
      }
    })().catch(error => {
      if (generation === current && !signal.aborted)
        useImageCapabilities.setState({
          canGenerate: false,
          canEdit: false,
          error: error instanceof Error ? error.message : String(error),
        });
    });
  };
  const unsubscribe = useSettingStore.subscribe((state, previous) => {
    if (
      state.setting.imageGeneration !== previous.setting.imageGeneration ||
      state.setting.database.active !== previous.setting.database.active
    )
      refresh();
  });
  on("plugin-images:changed", refresh);
  refresh();
  return () => {
    generation++;
    controller?.abort();
    unsubscribe();
    off("plugin-images:changed", refresh);
    useImageCapabilities.setState({ canGenerate: false, canEdit: false, error: undefined });
  };
}
