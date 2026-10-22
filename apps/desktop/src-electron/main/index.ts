// 必须置于所有 import 之首：在模块单例（import 期/初始化期注册契约）之前装配契约桥
import "./rpc/command-bridge-install";
import "./startup-cpu-profile";
// 紧随其后安装日志（session 文件 + console 代理），保证后续模块的所有输出都能落盘
import "./modules/logger";
import { app, BrowserWindow, protocol, globalShortcut } from "electron";
import path, { extname, isAbsolute } from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync, statSync } from "node:fs";
import log from "electron-log";
// 渲染端 performance.memory 默认数值粗粒度且更新滞后，诊断内存泄漏需要精确采样
app.commandLine.appendSwitch("enable-precise-memory-info");
import {
  createMainWindow,
  createQuickCardWindow,
  initWindows,
  openMarkdownWindow,
  showOrCreateMainWindow,
} from "./windows";
import trayModule from "./modules/tray";
import recentProjectsModule from "./modules/recent-projects";
import PathUtil from "./utils/PathUtil";
import BackendWebSocketServer from "./utils/BackendWebSocketServer";
import { RpcMessageType, type RpcRequestMessage, type RpcResponseMessage } from "@/types";
import moduleInitManager from "./module-init/ModuleInitManager";
import { RPC_SERVER_PORT } from "./modules/server";
import { setupQuitController } from "./app-quit-controller";
import {
  shouldStartInBackground,
  shouldKeepBackgroundAlive,
} from "./services/background-preferences";

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

export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

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

// 窗口模块初始化前到达的打开请求（second-instance / open-file）先暂存
let windowsReady = false;
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
    getTrayManager: () => trayManager,
  });

  // 监听第二个实例启动时传入的参数
  app.on("second-instance", (_event, commandLine) => {
    // 首先检查是否有窗口类型参数
    const windowType = getWindowTypeFromArgs(commandLine);
    if (windowType && windowsReady) {
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
      if (windowsReady) showOrCreateMainWindow();
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

      // === 立即创建窗口管理器并显示窗口 ===
      initWindows({
        devServerUrl: VITE_DEV_SERVER_URL || "",
        rendererDist: RENDERER_DIST,
        preload,
      });
      windowsReady = true;

      // 根据启动参数创建窗口（窗口会显示 Loading 状态）
      if (windowTypeToOpen) {
        log.info(`根据窗口类型参数打开窗口: ${windowTypeToOpen}`);
        handleWindowType(windowTypeToOpen);
        windowTypeToOpen = null;
      } else if (
        filesToOpen.length === 0 &&
        !(await shouldStartInBackground().catch(error => {
          log.warn("后台启动设置读取失败，显示主窗口", error);
          return false;
        }))
      ) {
        log.info("创建主窗口");
        createMainWindow();
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
          moduleInitManager.setBackendServer(backendServer);
          await moduleInitManager.initWebSocketDependentModules();

          // 初始化托盘
          try {
            trayManager = await trayModule.init(preload);
          } catch (error) {
            if (BrowserWindow.getAllWindows().length === 0) showOrCreateMainWindow();
            throw error;
          }
          if (!trayManager.available && BrowserWindow.getAllWindows().length === 0)
            showOrCreateMainWindow();

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
        createQuickCardWindow();
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
        showOrCreateMainWindow();
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
    if (process.platform !== "darwin" && !shouldKeepBackgroundAlive()) {
      log.info("退出应用");
      app.quit();
    }
  });

  // 处理文件打开事件
  // macOS：访达「打开方式」、拖到 Dock 图标、双击关联文件（Markdown 文件或文件夹）
  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    log.info(`收到文件打开请求: ${filePath}`);
    if (windowsReady) {
      handleFileOrFolder(filePath);
    } else {
      // 冷启动时早于 ready 到达：暂存，就绪后统一处理（有暂存则不建主窗口）
      filesToOpen.push(filePath);
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

    if (isMarkdownPath(lowerPath)) {
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

// 函数声明（提升）：启动时解析命令行参数即会用到，早于本行执行
function isMarkdownPath(path: string) {
  return /\.(md|markdown)$/i.test(path);
}

// 处理文件或文件夹
function handleFileOrFolder(path: string) {
  if (!existsSync(path)) {
    log.warn(`路径不存在: ${path}`);
    return;
  }

  const stats = statSync(path);

  if (stats.isDirectory() || isMarkdownPath(path)) {
    // 文件夹 / Markdown 文件都进 Markdown 窗口（窗口模块负责区分与记入最近打开）
    openMarkdownWindow(path);
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
  if (!windowsReady) {
    log.warn("窗口模块未初始化");
    return;
  }

  switch (windowType) {
    case "main":
      log.info("打开主窗口");
      showOrCreateMainWindow();
      break;
    default:
      log.warn(`未知的窗口类型: ${windowType}`);
      showOrCreateMainWindow();
  }
}
