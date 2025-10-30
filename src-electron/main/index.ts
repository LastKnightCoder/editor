import { app, BrowserWindow, protocol, globalShortcut } from "electron";
import path, { extname, isAbsolute } from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync, statSync } from "node:fs";
import log from "electron-log";
import resourceModule from "./modules/resource";
import databaseModule from "./modules/database";
import settingModule from "./modules/setting";
import llmModule from "./modules/llm";
import streamFetchModule from "./modules/stream-fetch";
import aliOssModule from "./modules/ali-oss";
import fileModule from "./modules/file";
import extraModule from "./modules/extra";
import voiceCopyModule from "./modules/voice-copy";
import windowManagerModule from "./modules/window-manager";
import loggerModule from "./modules/logger";
import trayModule from "./modules/tray";
import serverModule from "./modules/server";
import bilibiliCacheModule from "./modules/bilibili-cache";
import youtubeCacheModule from "./modules/youtube-cache";
import typstModule from "./modules/typst";
import userSettingModule from "./modules/user-setting";
import pomodoroModule from "./modules/pomodoro";
import notionModule from "./modules/notion";
import notionCacheModule from "./modules/notion-cache";
import recentProjectsModule from "./modules/recent-projects";
import PathUtil from "./utils/PathUtil";
import BackendWebSocketServer from "./utils/BackendWebSocketServer";

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

// 劫持 jieba 加载 dict 时找不到
const originalResolve = require.resolve;
require.resolve = function (spec: string, options: any) {
  if (spec.endsWith("dict.txt") || spec.endsWith("idf.txt")) {
    // 关键拦截点
    const realPath = path.join(
      app.isPackaged ? process.resourcesPath : __dirname,
      spec,
    );
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
if (process.platform === "win32") {
  app.setUserTasks([
    {
      program: process.execPath,
      arguments: "--window-type=main",
      iconPath: process.execPath,
      iconIndex: 0,
      title: "打开笔记应用",
      description: "打开笔记应用主界面",
    },
    {
      program: process.execPath,
      arguments: "--window-type=todo",
      iconPath: process.execPath,
      iconIndex: 0,
      title: "任务清单",
      description: "打开任务清单窗口",
    },
    {
      program: process.execPath,
      arguments: "--window-type=question",
      iconPath: process.execPath,
      iconIndex: 0,
      title: "问题管理",
      description: "打开问题管理窗口",
    },
    {
      program: process.execPath,
      arguments: "--window-type=goal",
      iconPath: process.execPath,
      iconIndex: 0,
      title: "进度管理",
      description: "打开进度管理窗口",
    },
    {
      program: process.execPath,
      arguments: "--window-type=pomodoro",
      iconPath: process.execPath,
      iconIndex: 0,
      title: "番茄专注",
      description: "打开番茄专注窗口",
    },
  ]);
}

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

  app.whenReady().then(() => {
    log.info("应用就绪");

    initModules().then(() => {
      // 处理窗口类型参数
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

      // 注册全局快捷键 Ctrl/Command+N 打开快速卡片窗口
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

      // 应用初始化完成后，处理之前保存的文件路径
      if (filesToOpen.length > 0) {
        log.info(`处理启动时收到的文件或文件夹: ${filesToOpen}`);
        filesToOpen.forEach((filePath) => {
          handleFileOrFolder(filePath);
        });
        // 处理完毕后清空
        filesToOpen = [];
      }

      app.on("activate", () => {
        log.info("应用激活");
        if (BrowserWindow.getAllWindows().length === 0) {
          windowManager.createMainWindow();
        }
      });
    });

    protocol.handle("ltoh", async (request) => {
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
        if (
          (rangeHeader && mimeType.startsWith("video/")) ||
          mimeType.startsWith("audio/")
        ) {
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
            { start, end },
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

  // 添加退出前的清理
  app.on("before-quit", () => {
    log.info("应用即将退出，执行清理");
    // 注销所有全局快捷键
    globalShortcut.unregisterAll();

    if (trayManager) {
      trayManager.destroyTray();
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
  streamOptions?: { start?: number; end?: number },
) {
  const stream = createReadStream(path, streamOptions);
  return new Response(stream as unknown as ReadableStream, options);
}

const initModules = async () => {
  // 首先初始化日志模块
  await loggerModule.init();

  log.info("应用启动");
  log.info(`操作系统: ${os.platform()} ${os.release()}`);
  log.info(`Node.js 版本: ${process.version}`);
  log.info(`Electron 版本: ${process.versions.electron}`);

  log.info("开始初始化其他模块");
  const startTime = Date.now();

  try {
    await Promise.allSettled([
      settingModule.init(),
      resourceModule.init(),
      databaseModule.init(),
      llmModule.init(),
      streamFetchModule.init(),
      aliOssModule.init(),
      fileModule.init(),
      extraModule.init(),
      voiceCopyModule.init(),
      serverModule.init(),
      bilibiliCacheModule.init(),
      youtubeCacheModule.init(),
      typstModule.init(),
      notionModule.init(),
      notionCacheModule.init(),
    ]);

    const backendServer = new BackendWebSocketServer(24678);
    await userSettingModule.init(backendServer);
    await pomodoroModule.init(backendServer);

    // 初始化窗口管理器
    windowManager = await windowManagerModule.init(
      VITE_DEV_SERVER_URL || "",
      RENDERER_DIST,
      preload,
    );

    // 初始化托盘管理器
    trayManager = await trayModule.init(windowManager, preload);

    // 注册最近项目模块
    recentProjectsModule.registerListeners();
    recentProjectsModule.setOnProjectOpen(handleFileOrFolder);
    recentProjectsModule.updateJumpList();

    log.info(`所有模块初始化完成，耗时: ${Date.now() - startTime}ms`);
  } catch (e) {
    log.error("模块初始化失败", e);
  }
};

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
    if (executableExtensions.some((ext) => lowerPath.endsWith(ext))) {
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
    case "goal":
      log.info("打开进度管理窗口");
      if (typeof windowManager.createGoalWindow === "function") {
        windowManager.createGoalWindow();
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
