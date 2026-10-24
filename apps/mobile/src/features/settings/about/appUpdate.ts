// Android 应用内更新的前端状态：检查 → 下载（校验）→ 交给系统安装器。
// 命令实现见 src-tauri/src/app_update.rs；状态放模块级 store，离开关于页后下载继续、回来仍能看到进度。

import { useEffect } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { toast } from "../../../components/toast";
import { parseInvokeError } from "../../../services/errors";

export type ReleaseNote = { version: string; note: string };

export type AndroidRelease = {
  version: string;
  releaseDate: string;
  file: string;
  size: number;
  sha256: string;
  releaseNotes: ReleaseNote[];
};

export type AppUpdateCheck = {
  currentVersion: string;
  available: boolean;
  latest: AndroidRelease;
};

type DownloadProgress = { received: number; total: number };
type InstallOutcome = "started" | "permission-required";

export type UpdatePhase = "idle" | "checking" | "latest" | "available" | "downloading" | "ready";

type AppUpdateState = {
  phase: UpdatePhase;
  check: AppUpdateCheck | null;
  /** 最近一次检查成功的时间，用于控制自动检查频率 */
  checkedAt: number | null;
  progress: DownloadProgress | null;
  downloadedVersion: string | null;
  error: string | null;
  checkForUpdate: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
};

export function supportsInAppUpdate(userAgent = navigator.userAgent): boolean {
  return /Android/i.test(userAgent);
}

const ERROR_MESSAGES: Record<string, string> = {
  APP_UPDATE_NETWORK: "网络连接失败，请稍后重试",
  APP_UPDATE_MANIFEST_INVALID: "更新信息暂不可用，请稍后重试",
  APP_UPDATE_CORRUPT: "安装包校验未通过，请重新下载",
  APP_UPDATE_STORAGE: "无法保存安装包，请检查存储空间",
  APP_UPDATE_BUSY: "安装包正在下载",
  APP_UPDATE_NOT_DOWNLOADED: "安装包已失效，请重新下载",
  APP_UPDATE_INSTALL_FAILED: "无法打开系统安装器",
  APP_UPDATE_UNSUPPORTED: "当前设备不支持应用内更新",
};

function updateErrorMessage(error: unknown): string {
  return ERROR_MESSAGES[parseInvokeError(error).code] ?? "更新失败，请稍后重试";
}

export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 有新版本时展示跨越的每个版本（新到旧）；已是最新时只展示本版 */
export function notesToShow(check: AppUpdateCheck): ReleaseNote[] {
  const { currentVersion, latest, available } = check;
  return latest.releaseNotes
    .filter(item =>
      available
        ? compareVersions(item.version, currentVersion) > 0 &&
          compareVersions(item.version, latest.version) <= 0
        : item.version === currentVersion
    )
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** 自动检查的最短间隔：应用长时间留在后台，回到「我的」或关于页时超过该间隔才重新检查 */
export const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function shouldAutoCheck(
  state: Pick<AppUpdateState, "phase" | "checkedAt">,
  now: number
): boolean {
  if (state.phase === "checking" || state.phase === "downloading" || state.phase === "ready") {
    return false;
  }
  return state.checkedAt === null || now - state.checkedAt >= AUTO_CHECK_INTERVAL_MS;
}

export const useAppUpdate = create<AppUpdateState>((set, get) => ({
  phase: "idle",
  check: null,
  checkedAt: null,
  progress: null,
  downloadedVersion: null,
  error: null,

  async checkForUpdate() {
    const { phase } = get();
    if (phase === "checking" || phase === "downloading") return;
    set({ phase: "checking", error: null });
    try {
      const check = await invoke<AppUpdateCheck>("app_update_check");
      const ready = check.available && get().downloadedVersion === check.latest.version;
      set({
        check,
        checkedAt: Date.now(),
        phase: ready ? "ready" : check.available ? "available" : "latest",
      });
    } catch (error) {
      const previous = get().check;
      const phase = previous ? (previous.available ? "available" : "latest") : "idle";
      set({ phase, error: updateErrorMessage(error) });
    }
  },

  async download() {
    if (get().phase !== "available") return;
    const onProgress = new Channel<DownloadProgress>();
    onProgress.onmessage = progress => set({ progress });
    set({ phase: "downloading", progress: null, error: null });
    try {
      const version = await invoke<string>("app_update_download", { onProgress });
      set({ phase: "ready", downloadedVersion: version });
      await get().install();
    } catch (error) {
      set({ phase: "available", progress: null, error: updateErrorMessage(error) });
    }
  },

  async install() {
    const version = get().downloadedVersion;
    if (!version) return;
    try {
      const outcome = await invoke<InstallOutcome>("app_update_install", { version });
      if (outcome === "permission-required") {
        toast.info("请在系统设置中允许 Tau 安装应用，返回后点「安装」");
      }
    } catch (error) {
      const message = updateErrorMessage(error);
      // 缓存被系统清理后只能重新下载
      if (parseInvokeError(error).code === "APP_UPDATE_NOT_DOWNLOADED") {
        set({ phase: "available", downloadedVersion: null, error: message });
        return;
      }
      set({ error: message });
    }
  },
}));

/** 挂载时按需检查更新（仅 Android）；结果进模块级 store，「我的」入口与关于页共用 */
export function useAutoUpdateCheck() {
  useEffect(() => {
    if (!supportsInAppUpdate()) return;
    const state = useAppUpdate.getState();
    if (shouldAutoCheck(state, Date.now())) void state.checkForUpdate();
  }, []);
}
