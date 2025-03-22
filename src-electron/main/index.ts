import { app, BrowserWindow, protocol } from "electron";
import path, { extname } from "node:path";
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

let windowManager: Awaited<ReturnType<typeof windowManagerModule.init>>;

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
    await Promise.all([
      settingModule.init(),
      resourceModule.init(),
      databaseModule.init(),
      llmModule.init(),
      streamFetchModule.init(),
      aliOssModule.init(),
      fileModule.init(),
      extraModule.init(),
      voiceCopyModule.init(),
    ]);

    // 初始化窗口管理器
    windowManager = await windowManagerModule.init(
      VITE_DEV_SERVER_URL || "",
      RENDERER_DIST,
      preload,
    );

    log.info(`所有模块初始化完成，耗时: ${Date.now() - startTime}ms`);
  } catch (e) {
    log.error("模块初始化失败", e);
  }
};

app.whenReady().then(() => {
  log.info("应用就绪");

  initModules().then(() => {
    log.info("创建主窗口");
    windowManager.createMainWindow();

    app.on("activate", () => {
      log.info("应用激活");
      if (BrowserWindow.getAllWindows().length === 0) {
        windowManager.createMainWindow();
      }
    });
  });

  protocol.handle("ltoh", async (request) => {
    const startTime = Date.now();
    log.debug(`协议请求: ${request.url}`);

    try {
      // 转换URL为文件路径
      const parsedUrl = new URL(request.url);
      const filePath = parsedUrl.pathname.slice(
        process.platform === "win32" ? 1 : 0,
      );

      // 验证文件存在
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        log.warn(`文件不存在: ${filePath}`);
        return new Response("Not Found", { status: 404 });
      }

      // 获取文件信息
      const stats = statSync(filePath);
      const fileSize = stats.size;
      const rangeHeader = request.headers.get("range") || "";
      const mimeType = getMimeType(extname(filePath));

      log.debug(`文件信息 [${filePath}]: 大小=${fileSize}, 类型=${mimeType}`);

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
          filePath,
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
      log.debug(`处理完整文件请求: ${filePath}`);
      return streamResponse(filePath, {
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
