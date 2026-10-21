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

function currentProvider() {
  const { providers, currentProviderId } = useSettingStore.getState().setting.imageGeneration;
  return providers.find(item => item.id === currentProviderId);
}

/** 只有影响实例的字段参与比较：改配置名称等展示字段不重新探测 */
function probeKey() {
  const setting = currentProvider();
  if (!setting) return "";
  return JSON.stringify([
    setting.id,
    setting.pluginId,
    setting.modelId,
    setting.config,
    useSettingStore.getState().setting.database.active,
  ]);
}

export function startImageCapabilities() {
  if (!isElectron) return () => {};
  let generation = 0;
  let controller: AbortController | undefined;
  let lastKey = probeKey();
  let probedProviderId: string | undefined;
  const refresh = () => {
    const current = ++generation;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const setting = currentProvider();
    // 同一配置重新探测期间沿用上次结果，避免状态先清空再恢复造成闪烁
    if (setting?.id !== probedProviderId)
      useImageCapabilities.setState({ canGenerate: false, canEdit: false, error: undefined });
    probedProviderId = setting?.id;
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
  const unsubscribe = useSettingStore.subscribe(() => {
    const key = probeKey();
    if (key === lastKey) return;
    lastKey = key;
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
