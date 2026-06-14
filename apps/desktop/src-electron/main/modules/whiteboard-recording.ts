import {
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  screen,
  session,
  app,
  type DesktopCapturerSource,
} from "electron";
import fs from "node:fs/promises";
import { join } from "node:path";
import { ensureDir, pathExists, remove } from "fs-extra/esm";
import log from "electron-log";
import { Module } from "../types/module";
import PathUtil from "../utils/PathUtil";
import MediaUtil from "../utils/MediaUtil";

export type WhiteboardRecordingOutputFormat = "webm" | "mp4" | "mov" | "mkv";

interface SaveRecordingPayload {
  bytes: Uint8Array;
  outputFormat: WhiteboardRecordingOutputFormat;
  saveDirectory?: string;
}

interface RecordingSource {
  id: string;
  name: string;
  type: "screen" | "window";
  thumbnailDataUrl: string;
  displayId?: string;
}

interface PrepareCaptureSourcePayload {
  sourceType: "screen" | "window";
}

const CONTROL_WINDOW_TITLE = "Tau Whiteboard Recording Controls";
const CONTROL_WINDOW_ALWAYS_ON_TOP_LEVEL = "screen-saver" as const;

class WhiteboardRecordingModule implements Module {
  name = "whiteboard-recording";
  private controlWindow: BrowserWindow | null = null;
  private mainWindowProvider: (() => BrowserWindow | null) | null = null;
  private preloadPath = "";
  private rendererDistPath = "";
  private viteDevServerUrl = "";
  private isAppQuitting = false;
  private controlsReady = false;

  configure(options: {
    mainWindowProvider: () => BrowserWindow | null;
    preloadPath: string;
    rendererDistPath: string;
    viteDevServerUrl: string;
  }) {
    this.mainWindowProvider = options.mainWindowProvider;
    this.preloadPath = options.preloadPath;
    this.rendererDistPath = options.rendererDistPath;
    this.viteDevServerUrl = options.viteDevServerUrl;
    this.createControlWindow();
    app.once("before-quit", () => {
      this.destroyControlWindow();
    });
  }

  async init() {
    ipcMain.handle("whiteboard-recording:get-sources", async () => {
      return this.getSources();
    });
    ipcMain.handle("whiteboard-recording:get-default-save-directory", () => {
      return this.getDefaultSaveDirectory();
    });
    ipcMain.handle("whiteboard-recording:save", async (_event, payload) => {
      return this.saveRecording(payload);
    });
    ipcMain.handle(
      "whiteboard-recording:prepare-capture-source",
      async (_event, payload: PrepareCaptureSourcePayload) => {
        return await this.prepareCaptureSource(payload.sourceType);
      },
    );
    ipcMain.handle("whiteboard-recording:open-controls", () => {
      this.showControlWindow();
    });
    ipcMain.handle("whiteboard-recording:close-controls", () => {
      this.hideControlWindow();
    });
    ipcMain.handle("whiteboard-recording:controls-resize", (_event, size) => {
      this.resizeControlWindow(size);
    });
    ipcMain.handle(
      "whiteboard-recording:controls-command",
      (_event, command) => {
        this.sendToMainWindow("whiteboard-recording:controls-command", command);
      },
    );
    ipcMain.handle("whiteboard-recording:controls-state", (_event, state) => {
      this.sendToControls("whiteboard-recording:controls-state", state);
    });
  }

  private async getSources(): Promise<RecordingSource[]> {
    const sources = await this.getScreenSources();
    const mainWindow = this.mainWindowProvider?.();
    const mainSourceId = this.getMainWindowMediaSourceId(mainWindow);
    const mainWindowSource: RecordingSource = {
      id: mainSourceId || "web-frame:main-window",
      name: mainWindow?.getTitle() || "Tau 当前应用窗口",
      type: "window",
      thumbnailDataUrl: "",
    };

    return [
      mainWindowSource,
      ...this.sortSources(sources, mainSourceId).map(
        (source): RecordingSource => {
          const type = this.getSourceType(source);
          return {
            id: source.id,
            name: source.name,
            type,
            displayId: source.display_id,
            thumbnailDataUrl: source.thumbnail.toDataURL(),
          };
        },
      ),
    ];
  }

  private async getScreenSources(): Promise<DesktopCapturerSource[]> {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 280, height: 160 },
      fetchWindowIcons: false,
    });
    return sources.filter((source) => source.name !== CONTROL_WINDOW_TITLE);
  }

  private getSourceType(
    source: DesktopCapturerSource,
  ): RecordingSource["type"] {
    return source.id.startsWith("screen:") ? "screen" : "window";
  }

  private sortSources(
    sources: DesktopCapturerSource[],
    mainSourceId?: string,
  ): DesktopCapturerSource[] {
    return [...sources].sort((left, right) => {
      const leftIsCurrent = !!mainSourceId && left.id === mainSourceId;
      const rightIsCurrent = !!mainSourceId && right.id === mainSourceId;
      if (leftIsCurrent !== rightIsCurrent) return leftIsCurrent ? -1 : 1;
      const leftType = this.getSourceType(left);
      const rightType = this.getSourceType(right);
      if (leftType !== rightType) return leftType === "window" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
  }

  private getMainWindowMediaSourceId(mainWindow?: BrowserWindow | null) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return undefined;
    }
    try {
      return mainWindow.getMediaSourceId();
    } catch (error) {
      log.warn("[WhiteboardRecording] 获取主窗口 media source id 失败", error);
      return undefined;
    }
  }

  private async prepareCaptureSource(sourceType: RecordingSource["type"]) {
    const mainWindow = this.mainWindowProvider?.();
    const mainSourceId = this.getMainWindowMediaSourceId(mainWindow);
    const source =
      sourceType === "screen"
        ? await this.getCaptureSource("screen", mainSourceId)
        : await this.getCaptureSource("window", mainSourceId);

    if (!source) {
      const message =
        sourceType === "screen"
          ? "没有找到当前屏幕的可录制源。"
          : "没有找到当前应用窗口的可录制源。";
      throw new Error(message);
    }

    log.info("[WhiteboardRecording] 准备录制源", {
      id: source.id,
      name: source.name,
      type: sourceType,
      mainSourceId,
      mainWindow: mainWindow
        ? {
            title: mainWindow.getTitle(),
            visible: mainWindow.isVisible(),
            minimized: mainWindow.isMinimized(),
            fullScreen: mainWindow.isFullScreen(),
            simpleFullScreen: mainWindow.isSimpleFullScreen?.(),
          }
        : null,
    });

    session.defaultSession.setDisplayMediaRequestHandler(
      (request, callback) => {
        log.info("[WhiteboardRecording] 使用桌面源捕获", {
          id: source.id,
          name: source.name,
          type: sourceType,
          securityOrigin: request.securityOrigin,
        });
        callback({
          video: source,
        });
      },
      { useSystemPicker: false },
    );

    return {
      id: source.id,
      name: source.name,
      type: sourceType,
      mediaSourceId: source.id,
    };
  }

  private async getCaptureSource(
    sourceType: RecordingSource["type"],
    mainSourceId?: string,
  ) {
    const sources = await desktopCapturer.getSources({
      types: [sourceType],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    const filteredSources = sources.filter(
      (source) => source.name !== CONTROL_WINDOW_TITLE,
    );
    const sortedSources = this.sortSources(filteredSources, mainSourceId);
    const source =
      sourceType === "window"
        ? sortedSources.find((candidate) => candidate.id === mainSourceId)
        : sortedSources[0];

    if (!source) {
      log.warn("[WhiteboardRecording] 未找到匹配录制源", {
        sourceType,
        mainSourceId,
        availableSources: sortedSources.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
        })),
      });
    }

    return source;
  }

  private getDefaultSaveDirectory(): string {
    return join(PathUtil.getHomeDir(), "Videos", "Tau Whiteboard");
  }

  private buildDefaultFileName(
    format: WhiteboardRecordingOutputFormat,
  ): string {
    const now = new Date();
    const pad = (value: number) => `${value}`.padStart(2, "0");
    const stamp = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      "-",
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join("");
    return `whiteboard-recording-${stamp}.${format}`;
  }

  private async saveRecording(payload: SaveRecordingPayload) {
    const outputFormat = payload.outputFormat || "webm";
    const saveDirectory =
      payload.saveDirectory?.trim() || this.getDefaultSaveDirectory();
    await ensureDir(saveDirectory);

    const outputPath = join(
      saveDirectory,
      this.buildDefaultFileName(outputFormat),
    );

    if (outputFormat === "webm") {
      await fs.writeFile(outputPath, Buffer.from(payload.bytes));
      return { outputPath, format: outputFormat };
    }

    const tempWebmPath = join(
      saveDirectory,
      this.buildDefaultFileName("webm").replace(".webm", ".tmp.webm"),
    );
    await fs.writeFile(tempWebmPath, Buffer.from(payload.bytes));

    try {
      await MediaUtil.transcodeVideo(tempWebmPath, outputPath);
      return { outputPath, format: outputFormat };
    } finally {
      if (await pathExists(tempWebmPath)) {
        await remove(tempWebmPath).catch((error) => {
          log.warn("[WhiteboardRecording] 删除临时录制文件失败", error);
        });
      }
    }
  }

  private createControlWindow() {
    if (this.controlWindow && !this.controlWindow.isDestroyed()) {
      return this.controlWindow;
    }

    const display = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    );
    this.controlWindow = new BrowserWindow({
      title: CONTROL_WINDOW_TITLE,
      width: 620,
      height: 96,
      x:
        display.workArea.x +
        Math.max(16, Math.floor((display.workArea.width - 620) / 2)),
      y: display.workArea.y + 24,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: this.preloadPath,
        spellcheck: false,
      },
    });

    this.keepControlWindowOnTop();
    (
      this.controlWindow as BrowserWindow & { __tauHiddenSingleton?: string }
    ).__tauHiddenSingleton = "whiteboard-recording-controls";

    this.controlWindow.on("close", (event) => {
      if (!this.isAppQuitting) {
        event.preventDefault();
        this.controlWindow?.hide();
      }
    });
    this.controlWindow.on("closed", () => {
      this.controlWindow = null;
      this.controlsReady = false;
    });
    this.controlWindow.webContents.setZoomFactor(1);
    this.controlWindow.webContents.setVisualZoomLevelLimits(1, 1);
    this.controlWindow.webContents.on("did-finish-load", () => {
      if (!this.controlWindow || this.controlWindow.isDestroyed()) {
        return;
      }
      this.controlWindow.webContents.setZoomFactor(1);
    });
    log.info("[WhiteboardRecording] 控制窗缩放已重置", {
      zoomFactor: this.controlWindow.webContents.getZoomFactor(),
    });

    if (this.viteDevServerUrl) {
      this.controlWindow
        .loadURL(`${this.viteDevServerUrl}#/whiteboard-recording-controls`)
        .catch((error) => {
          log.error("[WhiteboardRecording] 开发模式加载控制窗失败", error);
        });
    } else {
      this.controlWindow
        .loadFile(join(this.rendererDistPath, "index.html"), {
          hash: "/whiteboard-recording-controls",
        })
        .catch((error) => {
          log.error("[WhiteboardRecording] 生产模式加载控制窗失败", error);
        });
    }
    const shouldOpenDevTools = process.env.WHITEBOARD_RECORDING_DEBUG === "1";
    if (shouldOpenDevTools) {
      this.controlWindow.webContents.once("did-frame-finish-load", () => {
        if (this.controlWindow && !this.controlWindow.isDestroyed()) {
          this.controlWindow.webContents.openDevTools({ mode: "detach" });
        }
      });
    }
    this.controlWindow.once("ready-to-show", () => {
      this.controlsReady = true;
    });

    return this.controlWindow;
  }

  private positionControlWindow(width: number, height: number) {
    if (!this.controlWindow || this.controlWindow.isDestroyed()) {
      return;
    }

    const display = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    );
    const nextWidth = Math.max(
      1,
      Math.min(Math.round(width), display.workArea.width),
    );
    const nextHeight = Math.max(
      1,
      Math.min(Math.round(height), display.workArea.height),
    );
    log.info("[WhiteboardRecording] 调整控制窗内容尺寸", {
      width: nextWidth,
      height: nextHeight,
    });
    this.controlWindow.setContentSize(nextWidth, nextHeight);
    this.keepControlWindowOnTop();
    this.controlWindow.setPosition(
      display.workArea.x +
        Math.max(0, Math.floor((display.workArea.width - nextWidth) / 2)),
      display.workArea.y + 24,
    );
  }

  private resizeControlWindow(size: { width: number; height: number }) {
    if (!this.controlWindow || this.controlWindow.isDestroyed()) {
      return;
    }

    if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) {
      return;
    }

    const display = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    );
    const nextWidth = Math.max(
      1,
      Math.min(Math.ceil(size.width), display.workArea.width),
    );
    const nextHeight = Math.max(
      1,
      Math.min(Math.ceil(size.height), display.workArea.height),
    );
    if (
      this.controlWindow.getContentSize()[0] === nextWidth &&
      this.controlWindow.getContentSize()[1] === nextHeight
    ) {
      return;
    }

    this.controlWindow.setContentSize(nextWidth, nextHeight);
    this.keepControlWindowOnTop();
  }

  private showControlWindow() {
    const controlWindow = this.createControlWindow();
    if (!controlWindow || controlWindow.isDestroyed()) {
      return;
    }

    const bounds = controlWindow.getBounds();
    controlWindow.webContents.setZoomFactor(1);
    this.positionControlWindow(bounds.width, bounds.height);
    this.keepControlWindowOnTop();
    controlWindow.show();
    controlWindow.focus();

    if (!this.controlsReady) {
      log.info("[WhiteboardRecording] 控制窗仍在加载，已提前 show");
    }
  }

  private hideControlWindow() {
    if (this.controlWindow && !this.controlWindow.isDestroyed()) {
      this.controlWindow.hide();
    }
  }

  private keepControlWindowOnTop() {
    if (!this.controlWindow || this.controlWindow.isDestroyed()) {
      return;
    }
    this.controlWindow.setAlwaysOnTop(true, CONTROL_WINDOW_ALWAYS_ON_TOP_LEVEL);
    this.controlWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
    });
  }

  destroyControlWindow() {
    this.isAppQuitting = true;
    if (this.controlWindow && !this.controlWindow.isDestroyed()) {
      this.controlWindow.destroy();
    }
    this.controlWindow = null;
    this.controlsReady = false;
  }

  private sendToMainWindow(channel: string, payload: unknown) {
    const mainWindow = this.mainWindowProvider?.();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(channel, payload);
  }

  private sendToControls(channel: string, payload: unknown) {
    if (!this.controlWindow || this.controlWindow.isDestroyed()) return;
    this.controlWindow.webContents.send(channel, payload);
  }
}

export default new WhiteboardRecordingModule();
