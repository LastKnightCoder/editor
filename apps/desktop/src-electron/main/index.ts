// 必须置于所有 import 之首：在模块单例（import 期注册 ipcMain handler）之前安装拦截
import "./rpc/ipc-registry-install";
// 紧随其后安装日志（session 文件 + console 代理），保证后续模块的所有输出都能落盘
import "./modules/logger";
import { app, BrowserWindow, ipcMain, protocol, globalShortcut } from "electron";
import path, { extname, isAbsolute } from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync, statSync } from "node:fs";
import log from "electron-log";
import windowManagerModule from "./modules/window-manager";
import databaseModule, { type DatabaseReconnectSource } from "./modules/database";
import trayModule from "./modules/tray";
import recentProjectsModule from "./modules/recent-projects";
import PathUtil from "./utils/PathUtil";
import BackendWebSocketServer from "./utils/BackendWebSocketServer";
import {
  RpcMessageType,
  type RpcRequestMessage,
  type RpcResponseMessage,
  type SearchParams,
} from "@/types";
import FTSTable from "./modules/tables/fts";
import userSettingModule from "./modules/user-setting";
import { resolveEmbeddingConfig } from "./utils/embedding-config";
import moduleInitManager from "./module-init/ModuleInitManager";
import whiteboardRecordingModule from "./modules/whiteboard-recording";
import { getRpcToken, RPC_SERVER_PORT, setDefaultSenderProvider } from "./rpc/command-server";
import rpcEventBroadcaster from "./rpc/event-broadcaster";
import { setupQuitController } from "./app-quit-controller";

// 渲染进程启动引导：一次性返回调用凭证与身份。
// windowId 用 event.sender.id（webContents id），与事件广播路由的 id 空间一致
ipcMain.handle("rpc-bootstrap", event => {
  return {
    token: getRpcToken(),
    windowId: event.sender.id,
    port: RPC_SERVER_PORT,
  };
});

// 必须在第一个窗口创建之前拦截 webContents.send，启动期事件先入缓冲
rpcEventBroadcaster.installWebContentsPatch();

(async (): Promise<void> => {
  const contextMenu = await import("electron-context-menu");
  contextMenu.default({
    showCopyImageAddress: true,
    showCopyVideoAddress: true,
    showCopyLink: true,
    showInspectElement: true,
    showSearchWithGoogle: false,
    labels: {
      copy: "复制",
      cut: "剪切",
      paste: "粘贴",
      copyImage: "复制图片",
      copyImageAddress: "复制图片地址",
      copyVideoAddress: "复制视频地址",
      copyLink: "复制链接",
      selectAll: "全选",
      inspect: "检查元素",
    },
  });
})();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 初始化应用环境
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
process.env.APP_ROOT = path.join(__dirname, "../..");

// Windows 上 Chromium 的屏幕捕获默认使用 Windows.Graphics.Capture。
// 窗口录制走 Electron 的 WebFrameMain 捕获，不依赖 WGC window capturer。
if (process.platform === "win32") {
  app.commandLine.appendSwitch("disable-features", "AllowWgcScreenCapturer");
}

export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

// 劫持 jieba 加载 dict 时找不到
const originalResolve = require.resolve;
require.resolve = function (spec: string, options: any) {
  if (spec.endsWith("dict.txt") || spec.endsWith("idf.txt")) {
    // 关键拦截点
    const realPath = path.join(app.isPackaged ? process.resourcesPath : __dirname, spec);
    return realPath;
  }
  return originalResolve(spec, options);
} as any;

const preload = path.join(__dirname, "../preload/index.js");

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith("6.1")) {
  app.disableHardwareAcceleration();
}

// Set application name for Windows 10+ notifications
if (process.platform === "win32") {
  app.setAppUserModelId(app.getName());
}

// 注册文件关联
app.setAsDefaultProtocolClient("tau");

let windowManager: Awaited<ReturnType<typeof windowManagerModule.init>>;
let trayManager: Awaited<ReturnType<typeof trayModule.init>>;

// 添加全局变量，存储启动时传入的文件路径
let filesToOpen: string[] = [];
// 存储启动时要打开的窗口类型
let windowTypeToOpen: string | null = null;

// 捕获命令行参数中的文件路径
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 如果获取不到单例锁，说明已经有一个实例正在运行，直接退出
  app.quit();
} else {
  // 受控退出：接管 before-quit，先完成收尾（自动同步、协作文档落盘）再真正退出
  setupQuitController({
    getWindowManager: () => windowManager,
    getTrayManager: () => trayManager,
  });

  // 监听第二个实例启动时传入的参数
  app.on("second-instance", (_event, commandLine) => {
    // 首先检查是否有窗口类型参数
    const windowType = getWindowTypeFromArgs(commandLine);
    if (windowType && windowManager) {
      handleWindowType(windowType);
      return;
    }

    // 处理第二个实例的命令行参数（文件路径）
    const filePath = getFilePathFromArgs(commandLine);
    if (filePath) {
      handleFileOrFolder(filePath);
    } else {
      // 没有文件路径参数，显示或创建主窗口
      log.info("第二个实例启动，没有文件参数，显示主窗口");
      if (windowManager) {
        windowManager.showOrCreateMainWindow();
      }
    }
  });

  // 处理初次启动时的命令行参数
  const argv = process.argv;
  log.info(`启动命令行参数: ${JSON.stringify(argv)}`);

  // 首先检查窗口类型参数
  windowTypeToOpen = getWindowTypeFromArgs(argv);
  if (windowTypeToOpen) {
    log.info(`检测到窗口类型参数: ${windowTypeToOpen}`);
  } else {
    // 检查文件路径参数
    const filePathFromArgs = getFilePathFromArgs(argv);
    if (filePathFromArgs) {
      log.info(`检测到文件或文件夹参数: ${filePathFromArgs}`);
      filesToOpen.push(filePathFromArgs);
    } else {
      log.info("未检测到有效的文件或文件夹参数");
    }
  }

  app.whenReady().then(async () => {
    log.info("应用就绪");
    const totalStartTime = Date.now();

    try {
      // === IMMEDIATE 层：立即初始化必要模块 ===
      await moduleInitManager.initImmediate();
      log.info(`IMMEDIATE 层初始化完成，耗时: ${Date.now() - totalStartTime}ms`);

      log.info("应用启动");
      log.info(`操作系统: ${os.platform()} ${os.release()}`);
      log.info(`Node.js 版本: ${process.version}`);
      log.info(`Electron 版本: ${process.versions.electron}`);
      if (process.platform === "win32") {
        log.info(
          `[WhiteboardRecording] Windows 录制启动参数 disable-features=${app.commandLine.getSwitchValue(
            "disable-features"
          )}`
        );
      }

      // === 立即创建窗口管理器并显示窗口 ===
      windowManager = await windowManagerModule.init(
        VITE_DEV_SERVER_URL || "",
        RENDERER_DIST,
        preload
      );
      // HTTP RPC 的 sender 兜底解析：未携带 windowId 的请求视为主窗口发起
      setDefaultSenderProvider(() => windowManager?.getMainWindow()?.webContents ?? null);
      whiteboardRecordingModule.configure({
        mainWindowProvider: () => windowManager.getMainWindow(),
        preloadPath: preload,
        rendererDistPath: RENDERER_DIST,
        viteDevServerUrl: VITE_DEV_SERVER_URL || "",
      });

      // 根据启动参数创建窗口（窗口会显示 Loading 状态）
      if (windowTypeToOpen) {
        log.info(`根据窗口类型参数打开窗口: ${windowTypeToOpen}`);
        handleWindowType(windowTypeToOpen);
        windowTypeToOpen = null;
      } else if (filesToOpen.length === 0) {
        log.info("创建主窗口");
        windowManager.createMainWindow();
      } else {
        log.info("检测到通过文件关联(.md)启动，跳过创建主窗口");
      }

      log.info(`窗口创建完成，总耗时: ${Date.now() - totalStartTime}ms`);

      // === BACKGROUND 层：后台初始化核心服务 ===
      // 使用 setImmediate 让窗口先渲染
      setImmediate(async () => {
        const backgroundStart = Date.now();
        log.info("开始后台初始化核心服务...");

        try {
          // 初始化 BACKGROUND 层模块
          await moduleInitManager.initBackground();

          // 接入事件广播通道（server 模块已 listen），连接后 flush 启动期缓冲
          rpcEventBroadcaster.start(RPC_SERVER_PORT);

          // 创建 WebSocket 服务器并初始化依赖模块
          const backendServer = new BackendWebSocketServer(RPC_SERVER_PORT);
          backendServer.addMessageHandler(
            "todo:broadcast-mutation",
            async (message: RpcRequestMessage) => {
              const event = message.params as unknown;
              backendServer.sendNotification("todo:mutation", event);
              const response: RpcResponseMessage = {
                id: message.id,
                type: RpcMessageType.Response,
                method: message.method,
                result: { ok: true },
                error: null,
              };
              return response;
            }
          );
          backendServer.addMessageHandler(
            "open-card-in-new-window",
            async (message: RpcRequestMessage) => {
              const [databaseName, cardId, options] = message.params as unknown as [
                string,
                number,
                { showTitlebar?: boolean; isDefaultTop?: boolean } | undefined,
              ];
              log.info(`[ws] open-card-in-new-window: db=${databaseName}, card=${cardId}`);
              windowManager.createEditorWindow("card", {
                databaseName,
                itemId: cardId,
                ...options,
              });
              const response: RpcResponseMessage = {
                id: message.id,
                type: RpcMessageType.Response,
                method: message.method,
                result: { ok: true },
                error: null,
              };
              return response;
            }
          );
          backendServer.addMessageHandler("close-database", async (message: RpcRequestMessage) => {
            const [name] = message.params as unknown as [string];
            log.info(`[ws] close-database: db=${name}`);
            const checkpointOk = databaseModule.forceCheckpoint(name);
            if (!checkpointOk) {
              log.error(`[ws] close-database: checkpoint failed for db=${name}, aborting`);
              const response: RpcResponseMessage = {
                id: message.id,
                type: RpcMessageType.Response,
                method: message.method,
                result: null,
                error: {
                  code: -1,
                  message:
                    "Checkpoint failed: WAL has uncommitted data. Cannot safely close database for sync.",
                },
              };
              return response;
            }
            const database = databaseModule.getDatabase(name);
            if (database) {
              database.close();
              databaseModule.databases.delete(name);
            }
            const response: RpcResponseMessage = {
              id: message.id,
              type: RpcMessageType.Response,
              method: message.method,
              result: { ok: true },
              error: null,
            };
            return response;
          });
          backendServer.addMessageHandler(
            "reconnect-database-fast",
            async (message: RpcRequestMessage) => {
              const [name, source] = message.params as unknown as [
                string,
                DatabaseReconnectSource | undefined,
              ];
              log.info(`[ws] reconnect-database-fast: db=${name}, source=${source}`);
              databaseModule.reconnectForSync(name, source || "sync_upload_reconnect");
              const response: RpcResponseMessage = {
                id: message.id,
                type: RpcMessageType.Response,
                method: message.method,
                result: { ok: true },
                error: null,
              };
              return response;
            }
          );
          backendServer.addMessageHandler("search-content", async (message: RpcRequestMessage) => {
            const [searchParams] = message.params as unknown as [SearchParams];

            if (!searchParams.modelInfo) {
              const setting = await userSettingModule.getSettingSnapshot();
              const embeddingConfig = resolveEmbeddingConfig(setting as any);
              if (embeddingConfig) {
                searchParams.modelInfo = {
                  configId: embeddingConfig.configId,
                  providerType: embeddingConfig.providerType,
                  model: embeddingConfig.model,
                  distance: embeddingConfig.distance,
                  dimensions: embeddingConfig.dimensions,
                  batchSize: embeddingConfig.batchSize,
                  devicePolicy: embeddingConfig.devicePolicy,
                  localModelDir: embeddingConfig.localModelDir,
                  key: embeddingConfig.apiKey,
                  baseUrl: embeddingConfig.baseUrl,
                };
              }
            }

            const dbName = databaseModule.getCurrentDatabaseName();
            const mainDb = databaseModule.getDatabase(dbName);
            const indexDb = databaseModule.getCurrentIndexDatabase();

            let results: any[] = [];
            if (mainDb && indexDb) {
              results = await FTSTable.searchHybridContent(mainDb, indexDb, searchParams);
            } else if (mainDb) {
              results = FTSTable.searchContent(mainDb, mainDb, searchParams);
            }

            const response: RpcResponseMessage = {
              id: message.id,
              type: RpcMessageType.Response,
              method: message.method,
              result: results,
              error: null,
            };
            return response;
          });
          backendServer.addMessageHandler(
            "read-later:add-from-extension",
            async (message: RpcRequestMessage) => {
              const params = message.params as unknown as {
                title: string;
                url: string;
                excerpt?: string;
              };
              const db = databaseModule.getCurrentDatabase();
              if (!db || !params?.url) {
                const response: RpcResponseMessage = {
                  id: message.id,
                  type: RpcMessageType.Response,
                  method: message.method,
                  result: null,
                  error: { code: 1, message: "数据库未就绪或参数缺失" },
                };
                return response;
              }
              const now = Date.now();
              const existing = db
                .prepare(`SELECT id FROM read_later WHERE url = ?`)
                .get(params.url) as { id: number } | undefined;
              if (existing) {
                const response: RpcResponseMessage = {
                  id: message.id,
                  type: RpcMessageType.Response,
                  method: message.method,
                  result: { ok: true, id: existing.id, duplicate: true },
                  error: null,
                };
                return response;
              }
              const res = db
                .prepare(
                  `INSERT INTO read_later (create_time, update_time, source_type, title, url, excerpt)
                   VALUES (?, ?, 'url', ?, ?, ?)`
                )
                .run(now, now, params.title || params.url, params.url, params.excerpt || null);
              const response: RpcResponseMessage = {
                id: message.id,
                type: RpcMessageType.Response,
                method: message.method,
                result: { ok: true, id: Number(res.lastInsertRowid) },
                error: null,
              };
              return response;
            }
          );
          moduleInitManager.setBackendServer(backendServer);
          await moduleInitManager.initWebSocketDependentModules();

          // 初始化托盘
          trayManager = await trayModule.init(windowManager, preload);

          // 注册最近项目模块
          recentProjectsModule.registerListeners();
          recentProjectsModule.setOnProjectOpen(handleFileOrFolder);
          recentProjectsModule.updateJumpList();

          log.info(`BACKGROUND 层初始化完成，耗时: ${Date.now() - backgroundStart}ms`);
          log.info(`应用完全就绪，总耗时: ${Date.now() - totalStartTime}ms`);
        } catch (error) {
          log.error("BACKGROUND 层初始化失败:", error);
        }
      });

      // 注册全局快捷键
      globalShortcut.register("CommandOrControl+Shift+N", () => {
        windowManager.createQuickCardWindow();
      });

      // 注册DPR调整快捷键
      globalShortcut.register("Ctrl+=", () => {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        if (focusedWindow) {
          const currentFactor = focusedWindow.webContents.getZoomFactor();
          focusedWindow.webContents.setZoomFactor(currentFactor + 0.1);
          log.info(`窗口DPR已调整为: ${currentFactor + 0.1}`);
        }
      });

      globalShortcut.register("Ctrl+-", () => {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        if (focusedWindow) {
          const currentFactor = focusedWindow.webContents.getZoomFactor();
          focusedWindow.webContents.setZoomFactor(currentFactor - 0.1);
        }
      });

      // 处理启动时的文件
      if (filesToOpen.length > 0) {
        log.info(`处理启动时收到的文件或文件夹: ${filesToOpen}`);
        filesToOpen.forEach(filePath => {
          handleFileOrFolder(filePath);
        });
        filesToOpen = [];
      }

      app.on("activate", () => {
        log.info("应用激活");
        windowManager.showOrCreateMainWindow();
      });
    } catch (error) {
      log.error("应用初始化失败:", error);
    }

    protocol.handle("ltoh", async request => {
      const startTime = Date.now();
      // log.debug(`协议请求: ${request.url}`);

      try {
        // 转换URL为文件路径
        const parsedUrl = new URL(request.url);
        const filePath = parsedUrl.pathname.slice(1);

        const realPath = PathUtil.getFilePath(filePath);
        // log.debug(`真实路径: ${realPath}`);

        // 验证文件存在
        if (!existsSync(realPath) || !statSync(realPath).isFile()) {
          log.warn(`文件不存在: ${realPath}`);
          return new Response("Not Found", { status: 404 });
        }

        // 获取文件信息
        const stats = statSync(realPath);
        const fileSize = stats.size;
        const rangeHeader = request.headers.get("range") || "";
        const mimeType = getMimeType(extname(realPath));

        // log.debug(`文件信息 [${realPath}]: 大小=${fileSize}, 类型=${mimeType}`);

        // 处理范围请求
        if ((rangeHeader && mimeType.startsWith("video/")) || mimeType.startsWith("audio/")) {
          const ranges = rangeHeader.replace(/bytes=/, "").split("-");
          const start = parseInt(ranges[0], 10);
          const end = ranges[1] ? parseInt(ranges[1], 10) : fileSize - 1;

          log.debug(`处理范围请求: ${start}-${end}/${fileSize}`);

          return streamResponse(
            realPath,
            {
              status: 206,
              headers: {
                "Content-Type": mimeType,
                "Content-Length": (end - start + 1).toString(),
                "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=31536000",
              },
            },
            { start, end }
          );
        }

        // 完整文件请求
        log.debug(`处理完整文件请求: ${realPath}`);
        return streamResponse(realPath, {
          status: 200,
          headers: {
            "Content-Type": mimeType,
            "Content-Length": fileSize.toString(),
            "Accept-Ranges": "bytes",
            "Cache-Control": "max-age=604800", // 7天缓存
          },
        });
      } catch (error) {
        log.error(`协议请求失败 [${Date.now() - startTime}ms]:`, error);
        return new Response("Internal Error", { status: 500 });
      }
    });
  });

  app.on("window-all-closed", () => {
    log.info("所有窗口已关闭");
    if (process.platform !== "darwin") {
      log.info("退出应用");
      app.quit();
    }
  });

  // 处理文件打开事件
  app.on("open-file", (_event, filePath) => {
    _event.preventDefault();
    log.info(`收到文件打开请求: ${filePath}`);

    // 检查是否为Markdown文件
    if (filePath.toLowerCase().endsWith(".md")) {
      if (windowManager) {
        log.info(`使用窗口管理器打开Markdown文件: ${filePath}`);
        windowManager.createEditorWindow("markdown", { filePath });
      } else {
        // 如果应用尚未初始化，保存文件路径以便后续处理
        log.info(`应用尚未初始化，保存Markdown文件路径: ${filePath}`);
        filesToOpen.push(filePath);
      }
    } else {
      log.info(`不支持打开的文件类型: ${filePath}`);
    }
  });
}

function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ogg": "video/ogg",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
  };
  return mimeTypes[ext.toLowerCase()] || "application/octet-stream";
}

function streamResponse(
  path: string,
  options: { status: number; headers: Record<string, string> },
  streamOptions?: { start?: number; end?: number }
) {
  const stream = createReadStream(path, streamOptions);
  return new Response(stream as unknown as ReadableStream, options);
}

// 从命令行参数中提取文件路径或文件夹路径
function getFilePathFromArgs(args: string[]): string | null {
  // 检查路径是否应该被处理：只处理 Markdown 文件或文件夹
  const shouldProcessPath = (path: string): boolean => {
    // 过滤掉以 -- 开头的参数
    if (path.startsWith("--")) {
      return false;
    }

    // 过滤掉相对路径（如 . 或 ..）
    if (path === "." || path === "..") {
      return false;
    }

    // 必须是绝对路径
    if (!isAbsolute(path)) {
      return false;
    }

    // 过滤掉可执行文件
    const lowerPath = path.toLowerCase();
    const executableExtensions = [".exe", ".dll", ".app"];
    if (executableExtensions.some(ext => lowerPath.endsWith(ext))) {
      return false;
    }

    // 只处理 .md 文件
    if (lowerPath.endsWith(".md")) {
      return true;
    }

    // 只处理文件夹
    if (existsSync(path)) {
      const stats = statSync(path);
      if (stats.isDirectory()) {
        return true;
      }
    }

    // 其他情况一律忽略
    return false;
  };

  // 最后一个参数通常是文件路径或文件夹路径
  const lastArg = args[args.length - 1];
  if (lastArg && shouldProcessPath(lastArg)) {
    log.info(`找到有效路径（最后一个参数）: ${lastArg}`);
    return lastArg;
  }

  // 遍历所有参数查找可能的文件路径或文件夹路径
  for (const arg of args) {
    if (shouldProcessPath(arg)) {
      log.info(`找到有效路径（遍历参数）: ${arg}`);
      return arg;
    }
  }

  log.info("未找到有效的文件或文件夹路径");
  return null;
}

// 处理文件或文件夹
function handleFileOrFolder(path: string) {
  if (!existsSync(path)) {
    log.warn(`路径不存在: ${path}`);
    return;
  }

  const stats = statSync(path);

  if (stats.isDirectory()) {
    // 是文件夹，以项目方式打开
    log.info(`打开文件夹作为项目: ${path}`);
    recentProjectsModule.addRecentProject(path);
    windowManager.createEditorWindow("markdown", { rootPath: path });
  } else if (path.toLowerCase().endsWith(".md")) {
    // 是 Markdown 文件
    log.info(`打开 Markdown 文件: ${path}`);
    windowManager.createEditorWindow("markdown", { filePath: path });
  } else {
    log.warn(`不支持的文件类型: ${path}`);
  }
}

// 从命令行参数中提取窗口类型
function getWindowTypeFromArgs(args: string[]): string | null {
  for (const arg of args) {
    if (arg.startsWith("--window-type=")) {
      const windowType = arg.split("=")[1];
      log.info(`找到窗口类型参数: ${windowType}`);
      return windowType;
    }
  }
  return null;
}

// 根据窗口类型打开相应的窗口
function handleWindowType(windowType: string) {
  if (!windowManager) {
    log.warn("窗口管理器未初始化");
    return;
  }

  switch (windowType) {
    case "main":
      log.info("打开主窗口");
      windowManager.showOrCreateMainWindow();
      break;
    case "todo":
      log.info("打开任务清单窗口");
      if (typeof windowManager.createTodoWindow === "function") {
        windowManager.createTodoWindow();
      }
      break;
    case "question":
      log.info("打开问题管理窗口");
      if (typeof windowManager.createQuestionWindow === "function") {
        windowManager.createQuestionWindow();
      }
      break;
    case "pomodoro":
      log.info("打开番茄专注窗口");
      if (typeof windowManager.createPomodoroWindow === "function") {
        windowManager.createPomodoroWindow();
      }
      break;
    default:
      log.warn(`未知的窗口类型: ${windowType}`);
      windowManager.showOrCreateMainWindow();
  }
}
