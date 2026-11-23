import { useEffect, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/queryClient";
import { useBackendWebsocketStore } from "@/stores/useBackendWebsocketStore";
import useSyncSetting from "@/hooks/useSyncSetting";
import useSyncFont from "@/hooks/useSyncFont";
import { send } from "@/electron";
import { startPerfObserver } from "@/utils/perf-observer";
import { connectPomodoroAudio } from "@/features/pomodoro/background-audio";
import "./window.css";

// 独立入口按窗口文档重载。
// oxlint-disable-next-line react/only-export-components
function AuxiliaryWindow({ Page }: { Page: ComponentType }) {
  useSyncSetting();
  useSyncFont();
  useEffect(() => {
    send("auxiliary:ready");
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <Page />
    </QueryClientProvider>
  );
}

startPerfObserver();
connectPomodoroAudio();
useBackendWebsocketStore.getState().initClient();

export function renderAuxiliary(
  container: HTMLElement,
  Page: ComponentType,
  onError: (error: unknown) => void
) {
  createRoot(container, { onUncaughtError: onError }).render(<AuxiliaryWindow Page={Page} />);
}
