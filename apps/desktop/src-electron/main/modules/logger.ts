import path from "node:path";
import fs from "node:fs";
import { ipcMain } from "electron";
import log from "electron-log";
import PathUtil from "../utils/PathUtil";

// 日志统一落盘到 ~/.editor/logs，session 粒度：每次启动一个文件，便于按会话排查问题
const LOG_DIR = path.join(PathUtil.getAppDir(), "logs");
// 超过 3 天的日志文件在启动时自动清理
const LOG_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
// 单文件上限 10MB，超出后轮转为 *.old.log（electron-log 默认 1MB 会频繁轮转丢历史）
const LOG_MAX_SIZE = 10 * 1024 * 1024;

const RENDERER_LOG_CHANNEL = "logger:renderer-log";
const RENDERER_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
type RendererLogLevel = (typeof RENDERER_LOG_LEVELS)[number];
interface RendererLogPayload {
  level?: unknown;
  message?: unknown;
  role?: unknown;
}

function isRendererLogLevel(value: unknown): value is RendererLogLevel {
  return typeof value === "string" && (RENDERER_LOG_LEVELS as readonly string[]).includes(value);
}

// 上次会话的启动标记：受控退出时删除；下次启动时仍在，说明上次是崩溃、被强制退出或断电
const EXIT_MARKER = path.join(PathUtil.getAppDir(), "session.incomplete");

// session 文件名：启动时间 + 随机后缀，避免秒级内连续重启撞名
function createSessionLogPath(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const suffix = Math.random().toString(16).slice(2, 6);
  return path.join(LOG_DIR, `session-${date}_${time}-${suffix}.log`);
}

const sessionLogPath = createSessionLogPath();

type ConsoleMethodName = "log" | "info" | "warn" | "error" | "debug";

// console.* 归并到 electron-log 的级别（debug 级别遵循文件 transport 的 info 阈值不落盘）
const consoleLevelMap: Record<ConsoleMethodName, RendererLogLevel> = {
  log: "info",
  info: "info",
  warn: "warn",
  error: "error",
  debug: "debug",
};

// 把主进程 console 方法代理到 logger：此后 console.log 与 log.info 写法等价，均可落盘。
// electron-log 的 console transport 在模块加载期已捕获原生 console 引用，不会递归
function installConsoleProxy() {
  for (const method of Object.keys(consoleLevelMap) as ConsoleMethodName[]) {
    const logFn = log[consoleLevelMap[method]].bind(log);
    console[method] = (...args: unknown[]) => {
      logFn(...args);
    };
  }
}

// 接收渲染进程劫持 console 后上报的日志，标注来源窗口后落盘。
// 来源只用窗口角色与编号：窗口标题就是笔记标题，不能进日志
function installRendererLogHandler() {
  const rendererLog = log.scope("renderer");
  ipcMain.on(RENDERER_LOG_CHANNEL, (event, payload: RendererLogPayload | undefined) => {
    if (!payload || typeof payload.message !== "string") {
      return;
    }
    const level = isRendererLogLevel(payload.level) ? payload.level : "info";
    const role = typeof payload.role === "string" && payload.role ? payload.role : "window";
    rendererLog[level](`[${role}#${event.sender.id}] ${payload.message}`);
  });
}

// 清理过期日志：logs 目录下的 session 文件（含轮转产物）
function cleanExpiredLogs() {
  const removeIfExpired = (filePath: string) => {
    try {
      const stats = fs.statSync(filePath);
      if (stats.mtimeMs < Date.now() - LOG_RETENTION_MS) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // 单个文件清理失败（占用/权限）不影响其余日志
    }
  };

  try {
    for (const name of fs.readdirSync(LOG_DIR)) {
      if (name.startsWith("session-")) {
        removeIfExpired(path.join(LOG_DIR, name));
      }
    }
  } catch {
    // 目录不存在时视为无待清理日志
  }
}

let installed = false;

// 日志配置；由主进程入口在 import 期最早调用，保证后续所有模块输出都能落盘。
// 原 log.initialize({ preload }) 注入的 electron-log 预加载脚本无消费方，已移除
export function setupLogger() {
  if (installed) {
    return { logDir: LOG_DIR, sessionLogPath };
  }
  installed = true;

  fs.mkdirSync(LOG_DIR, { recursive: true });
  log.transports.file.level = "info";
  log.transports.file.maxSize = LOG_MAX_SIZE;
  log.transports.file.resolvePathFn = () => sessionLogPath;
  log.transports.console.level = "debug";
  // 未捕获异常与未处理 Promise 拒绝落盘（不弹系统对话框）
  log.errorHandler.startCatching({ showDialog: false });

  installConsoleProxy();
  installRendererLogHandler();

  log.info("日志系统初始化，session 日志文件：", sessionLogPath);
  return { logDir: LOG_DIR, sessionLogPath };
}

setupLogger();

/** 取得单例锁后调用：标记仍在说明上次没有走到受控退出 */
export function markSessionStarted() {
  try {
    if (fs.existsSync(EXIT_MARKER)) {
      log.warn("上次会话未正常结束（崩溃、被强制退出或断电）", {
        lastStart: fs.readFileSync(EXIT_MARKER, "utf-8").trim(),
      });
    }
    fs.writeFileSync(EXIT_MARKER, new Date().toISOString());
  } catch {
    // 标记读写失败只影响这条提示，不影响启动
  }
}

/** 受控退出的最终动作前调用，之后的启动不再提示异常退出 */
export function markSessionEnded() {
  try {
    fs.rmSync(EXIT_MARKER, { force: true });
  } catch {
    // 删不掉时下次启动会多一条提示
  }
}

export default {
  init: async () => {
    setupLogger();
    cleanExpiredLogs();
    return { logDir: LOG_DIR, sessionLogPath };
  },
};
