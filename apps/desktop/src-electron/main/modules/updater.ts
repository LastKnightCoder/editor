import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import fsExtra from "fs-extra/esm";
import log from "electron-log";
import electronUpdaterPkg from "electron-updater";
import { isAppQuitting } from "../app-quit-controller";
import { Module } from "../types/module";
import PathUtil from "../utils/PathUtil";

const { autoUpdater } = electronUpdaterPkg;

// 与 electron-builder.yml 的 publish url 保持一致，用于组装手动下载兜底地址
const UPDATE_FEED_URL = "https://release-bin.oss-cn-shanghai.aliyuncs.com/desktop";

export interface ReleaseNote {
  version: string;
  note: string;
}

export interface UpdateCheckPayload {
  available: boolean;
  currentVersion: string;
  version: string | null;
  releaseDate: string | null;
  fallbackUrl: string | null;
  /** latest*.yml 中截至新版本的全部公告，由渲染端按当前版本截取 */
  releaseNotes: ReleaseNote[];
}

export interface VersionChangePayload {
  /** 上次启动的版本；首次安装或无变化时为 null */
  previousVersion: string | null;
  currentVersion: string;
}

const VERSION_STATE_FILE = "version-state.json";

/** electron-updater 的 releaseNotes 可能是字符串（单版本）或 {version, note} 数组 */
function normalizeReleaseNotes(raw: unknown, version: string | undefined): ReleaseNote[] {
  if (typeof raw === "string") return version && raw.trim() ? [{ version, note: raw }] : [];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is ReleaseNote =>
      typeof item?.version === "string" && typeof item?.note === "string"
  );
}

/**
 * 读出上次启动的版本并记录本次版本。
 */
async function recordLaunchVersion(currentVersion: string): Promise<string | null> {
  const appDir = PathUtil.getAppDir();
  const stateFile = join(appDir, VERSION_STATE_FILE);
  let previousVersion: string | null = null;
  try {
    const state = await fsExtra.readJson(stateFile);
    previousVersion = typeof state?.lastVersion === "string" ? state.lastVersion : null;
  } catch {
    // 状态文件缺失或损坏视为首次记录
  }
  if (previousVersion !== currentVersion) {
    await fsExtra.outputJson(stateFile, { lastVersion: currentVersion });
  }
  return previousVersion === currentVersion ? null : previousVersion;
}

export interface UpdateDownloadProgressPayload {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

/**
 * 应用自动更新模块
 * 更新源由 electron-builder 的 app-update.yml 内置（OSS generic provider），
 * 渲染端在关于页手动检查，或按设置开关在启动时静默检查后引导用户下载。
 */
class UpdaterModule implements Module {
  name = "updater";
  private downloading = false;
  private fallbackUrl: string | null = null;
  private versionChange: VersionChangePayload | null = null;

  async init(): Promise<void> {
    const currentVersion = app.getVersion();
    try {
      const previousVersion = await recordLaunchVersion(currentVersion);
      this.versionChange = { previousVersion, currentVersion };
    } catch (error) {
      log.error("updater record launch version failed:", error);
    }
    autoUpdater.logger = log;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("download-progress", progress => {
      this.broadcast("updater:download-progress", {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      } satisfies UpdateDownloadProgressPayload);
    });

    autoUpdater.on("update-downloaded", info => {
      this.downloading = false;
      this.broadcast("updater:update-downloaded", { version: info.version });
    });

    autoUpdater.on("error", error => {
      this.downloading = false;
      log.error("updater error:", error);
      this.broadcast("updater:error", { message: error?.message ?? String(error) });
    });

    ipcMain.handle("updater:check", async (): Promise<UpdateCheckPayload> => {
      // dev 模式下 electron-updater 没有可用的更新源，直接返回不可用
      if (!app.isPackaged) {
        return {
          available: false,
          currentVersion: app.getVersion(),
          version: null,
          releaseDate: null,
          fallbackUrl: null,
          releaseNotes: [],
        };
      }
      const result = await autoUpdater.checkForUpdates();
      const updateInfo = result?.updateInfo;
      this.fallbackUrl = updateInfo?.path ? `${UPDATE_FEED_URL}/${updateInfo.path}` : null;
      return {
        available: result?.isUpdateAvailable ?? false,
        currentVersion: app.getVersion(),
        version: updateInfo?.version ?? null,
        releaseDate: updateInfo?.releaseDate ?? null,
        fallbackUrl: this.fallbackUrl,
        releaseNotes: normalizeReleaseNotes(updateInfo?.releaseNotes, updateInfo?.version),
      };
    });

    // 只交付一次：渲染端重载不重复提示
    ipcMain.handle("updater:take-version-change", (): VersionChangePayload => {
      const change = this.versionChange ?? { previousVersion: null, currentVersion };
      this.versionChange = { previousVersion: null, currentVersion };
      return change;
    });

    ipcMain.handle("updater:download", async (): Promise<{ started: boolean }> => {
      if (!app.isPackaged || this.downloading) return { started: false };
      this.downloading = true;
      await autoUpdater.downloadUpdate();
      return { started: true };
    });

    ipcMain.handle("updater:install", () => {
      autoUpdater.quitAndInstall();
      // macOS 未正式签名时 Squirrel 校验会失败，quitAndInstall 静默卡死不退出；
      // 若 3 秒后进程仍在运行且未进入退出流程，判定安装失败并引导手动下载
      const timer = setTimeout(() => {
        if (isAppQuitting()) return;
        log.error("updater install did not restart the app, fallback to manual download");
        this.broadcast("updater:install-failed", { fallbackUrl: this.fallbackUrl });
      }, 3000);
      timer.unref?.();
    });

    log.info("UpdaterModule initialized");
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    }
  }
}

export default new UpdaterModule();
