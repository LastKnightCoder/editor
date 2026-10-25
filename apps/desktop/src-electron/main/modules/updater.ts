import { app, autoUpdater as nativeUpdater, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import fsExtra from "fs-extra/esm";
import log from "electron-log";
import electronUpdaterPkg from "electron-updater";
import { requestAppQuit } from "../app-quit-controller";
import { Module } from "../types/module";
import PathUtil from "../utils/PathUtil";

const { autoUpdater } = electronUpdaterPkg;

// 与 electron-builder.yml 的 publish url 保持一致，用于组装手动下载兜底地址
const UPDATE_FEED_URL = "https://dl.taunote.app/desktop";

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
 * 更新源由 electron-builder 的 app-update.yml 内置（generic provider），
 * 渲染端检测到新版本即在后台自动下载，下载完成后通知用户一键重启安装。
 */
class UpdaterModule implements Module {
  name = "updater";
  private downloading = false;
  private downloadedVersion: string | null = null;
  private readyToInstall = false;
  private installing = false;
  private installError: Error | null = null;
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
      this.downloadedVersion = info.version;
      if (process.platform !== "darwin") this.completeDownload();
    });
    // macOS 的下载事件早于 Squirrel 验包，原生确认后才允许安装。
    if (process.platform === "darwin")
      nativeUpdater.on("update-downloaded", () => this.completeDownload());

    autoUpdater.on("error", error => {
      this.downloading = false;
      this.readyToInstall = false;
      this.downloadedVersion = null;
      if (this.installing) this.installError = error;
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
      this.readyToInstall = false;
      this.downloadedVersion = null;
      try {
        await autoUpdater.downloadUpdate();
        return { started: true };
      } catch (error) {
        this.downloading = false;
        this.readyToInstall = false;
        this.downloadedVersion = null;
        throw error;
      }
    });

    ipcMain.handle("updater:install", async () => {
      if (this.installing) return;
      if (!app.isPackaged || !this.readyToInstall) throw new Error("更新尚未准备完成，请稍后重试");
      this.installing = true;
      this.installError = null;
      try {
        await requestAppQuit(() => {
          try {
            if (this.installError) throw this.installError;
            autoUpdater.quitAndInstall();
            if (this.installError) throw this.installError;
          } catch (error) {
            dialog.showErrorBox(
              "更新安装失败",
              `请重新打开应用或手动下载安装包。\n${String(error)}`
            );
            throw error;
          }
        });
      } finally {
        this.installing = false;
      }
    });

    log.info("UpdaterModule initialized");
  }

  private completeDownload(): void {
    if (!this.downloadedVersion || this.readyToInstall) return;
    this.downloading = false;
    this.readyToInstall = true;
    this.broadcast("updater:update-downloaded", { version: this.downloadedVersion });
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
        win.webContents.send(channel, payload);
      } catch (error) {
        log.warn(`更新通知发送失败：${channel}`, error);
      }
    }
  }
}

export default new UpdaterModule();
