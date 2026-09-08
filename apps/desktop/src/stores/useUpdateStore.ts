import { create } from "zustand";
import {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  onUpdateDownloadProgress,
  onUpdateDownloaded,
  onUpdateError,
} from "@/commands/updater";

export type UpdateStatus =
  | "idle" // 未检查
  | "checking" // 检查中
  | "upToDate" // 已是最新
  | "available" // 有新版本待下载
  | "downloading" // 下载中
  | "ready" // 已下载，待安装
  | "error";

interface UpdateState {
  status: UpdateStatus;
  currentVersion: string | null;
  newVersion: string | null;
  fallbackUrl: string | null;
  /** 本次 available 结果来自启动自动检查还是手动检查 */
  autoChecked: boolean;
  progress: number;
  errorMessage: string | null;
  check: (options?: { silent?: boolean }) => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return String(error);
};

export const useUpdateStore = create<UpdateState>()((set, get) => ({
  status: "idle",
  currentVersion: null,
  newVersion: null,
  fallbackUrl: null,
  autoChecked: false,
  progress: 0,
  errorMessage: null,
  check: async options => {
    if (get().status === "checking") return;
    set({ status: "checking", errorMessage: null });
    try {
      const result = await checkForUpdate();
      set({
        status: result.available ? "available" : "upToDate",
        currentVersion: result.currentVersion,
        newVersion: result.version,
        fallbackUrl: result.fallbackUrl,
        autoChecked: Boolean(options?.silent),
      });
    } catch (error) {
      // 静默检查（启动自动检查）失败不打扰用户
      set(
        options?.silent
          ? { status: "idle" }
          : { status: "error", errorMessage: getErrorMessage(error) }
      );
    }
  },
  download: async () => {
    if (get().status === "downloading") return;
    set({ status: "downloading", progress: 0 });
    try {
      await downloadUpdate();
    } catch (error) {
      set({ status: "error", errorMessage: getErrorMessage(error) });
    }
  },
  install: async () => {
    await installUpdate();
  },
}));

/** 挂载主进程更新事件监听，应用启动时调用一次 */
export function initUpdateListeners(): () => void {
  const unsubProgress = onUpdateDownloadProgress(progress => {
    const { status } = useUpdateStore.getState();
    if (status === "downloading" || status === "available") {
      useUpdateStore.setState({ status: "downloading", progress: progress.percent });
    }
  });
  const unsubDownloaded = onUpdateDownloaded(({ version }) => {
    useUpdateStore.setState({ status: "ready", progress: 100, newVersion: version });
  });
  const unsubError = onUpdateError(({ message }) => {
    const { status } = useUpdateStore.getState();
    if (status === "downloading") {
      useUpdateStore.setState({ status: "error", errorMessage: message });
    }
  });
  return () => {
    unsubProgress();
    unsubDownloaded();
    unsubError();
  };
}
