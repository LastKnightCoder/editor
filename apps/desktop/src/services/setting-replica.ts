import useSettingStore, {
  markRemoteSettingApplied,
  mergeSettingWithDefaults,
  type ISetting,
} from "@/stores/useSettingStore";

/** 辅助窗口复用主窗口的运行时快照，包括不落盘的会话校验状态。 */
export function connectSettingReplica(
  main: boolean,
  readFallback: () => Promise<ISetting>
): () => void {
  const channel = new BroadcastChannel("tau-setting-snapshot");
  let disposed = false;
  let received = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  const publish = () => {
    const { inited, setting } = useSettingStore.getState();
    if (inited) channel.postMessage({ kind: "snapshot", setting });
  };
  const apply = (setting: ISetting) => {
    markRemoteSettingApplied(setting);
    useSettingStore.setState({ setting, inited: true });
  };
  channel.onmessage = ({ data }) => {
    if (disposed || !data) return;
    if (main && data.kind === "request") publish();
    if (!main && data.kind === "snapshot" && data.setting) {
      received = true;
      clearTimeout(fallbackTimer);
      apply(data.setting);
    }
  };
  const unsubscribe = main
    ? useSettingStore.subscribe((state, prev) => {
        if (state.setting !== prev.setting || state.inited !== prev.inited) publish();
      })
    : undefined;
  if (main) {
    publish();
  } else {
    channel.postMessage({ kind: "request" });
    // 独立文件窗口可在没有主窗口时启动，保留只读快照兜底，不执行启动校验。
    fallbackTimer = setTimeout(() => {
      void readFallback()
        .then(setting => {
          if (!disposed && !received) apply(mergeSettingWithDefaults(setting));
        })
        .catch(error => console.error("[SettingSync] 读取辅助窗口设置快照失败", error));
    }, 1500);
  }
  return () => {
    disposed = true;
    clearTimeout(fallbackTimer);
    unsubscribe?.();
    channel.close();
  };
}
