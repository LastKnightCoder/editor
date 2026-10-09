import { create } from "zustand";
import {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  onInstallFailed,
  onUpdateDownloadProgress,
  onUpdateDownloaded,
  onUpdateError,
  type ReleaseNote,
} from "@/commands/updater";
import { notesBetween } from "@/features/release-notes/notes";

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
  /** 从当前版本到新版本之间（不含当前版本）的公告，从新到旧 */
  releaseNotes: ReleaseNote[];
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
  releaseNotes: [],
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
        releaseNotes:
          result.available && result.version
            ? notesBetween(result.releaseNotes, result.currentVersion, result.version)
            : [],
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
      const result = await downloadUpdate();
      if (!result.started) return; // 已有下载在进行（如另一窗口触发），安装由先到者负责
    } catch (error) {
      set({ status: "error", errorMessage: getErrorMessage(error) });
      return;
    }
    // 下载完成即重启安装（用户主动触发下载时已确认要更新）；
    // 安装失败由 onInstallFailed 事件兜底转手动下载
    try {
      await installUpdate();
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
    // downloading/ready 态的错误（下载失败、Squirrel 安装校验失败）都需要让用户看到
    if (status === "downloading" || status === "ready") {
      useUpdateStore.setState({ status: "error", errorMessage: message });
    }
  });
  const unsubInstallFailed = onInstallFailed(({ fallbackUrl }) => {
    useUpdateStore.setState({
      status: "error",
      errorMessage: "自动安装失败，请手动下载安装包",
      ...(fallbackUrl ? { fallbackUrl } : {}),
    });
  });
  return () => {
    unsubProgress();
    unsubDownloaded();
    unsubError();
    unsubInstallFailed();
  };
}
