// 前端 console 劫持：重写 console.* 方法，保留原输出行为的同时经 app_log 命令交给 Rust
// 写入 session 日志文件。纯浏览器（vite dev 无 Tauri）环境没有 IPC 通道，跳过安装保留原生 console。

import { invoke } from "@tauri-apps/api/core";

type ConsoleMethodName = "log" | "info" | "warn" | "error" | "debug";
export type LogLevel = "debug" | "info" | "warn" | "error";

// console 方法到日志级别的映射（console.log 归并为 info；debug 由 Rust 侧决定不落盘）
const CONSOLE_LEVELS: Record<ConsoleMethodName, LogLevel> = {
  log: "info",
  info: "info",
  warn: "warn",
  error: "error",
  debug: "debug",
};

// 单条日志长度上限，防止大对象刷爆 IPC 与日志文件
const MAX_MESSAGE_LENGTH = 4000;
// 限流：每秒最多上报条数，超出丢弃，日志风暴时保住 IPC 与日志文件
const RATE_LIMIT_PER_SECOND = 100;
const RATE_WINDOW_MS = 1000;

export function formatLogValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // 循环引用、DOM 节点等无法 JSON 序列化的值退化为 toString
    return String(value);
  }
}

export function hasTauriBridge(): boolean {
  return Boolean((globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function sendToHost(level: LogLevel, message: string): void {
  // 上报失败不能再走 console，否则与劫持互相递归
  invoke("app_log", { level, message }).catch(() => undefined);
}

/** 安装劫持；返回卸载函数，非 Tauri 环境返回 null */
export function setupConsoleLogger(
  send: (level: LogLevel, message: string) => void = sendToHost
): (() => void) | null {
  if (!hasTauriBridge()) return null;

  let windowStart = Date.now();
  let sentCount = 0;
  let droppedCount = 0;

  const report = (level: LogLevel, message: string) => {
    const now = Date.now();
    if (now - windowStart >= RATE_WINDOW_MS) {
      if (droppedCount > 0) {
        send("warn", `[console-logger] 触发限流，上一秒丢弃了 ${droppedCount} 条日志`);
        droppedCount = 0;
      }
      windowStart = now;
      sentCount = 0;
    }
    sentCount += 1;
    if (sentCount > RATE_LIMIT_PER_SECOND) {
      droppedCount += 1;
      return;
    }
    send(
      level,
      message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message
    );
  };

  const originals = {} as Record<ConsoleMethodName, (...args: unknown[]) => void>;
  for (const method of Object.keys(CONSOLE_LEVELS) as ConsoleMethodName[]) {
    const original = console[method].bind(console);
    originals[method] = console[method];
    console[method] = (...args: unknown[]) => {
      original(...args);
      report(CONSOLE_LEVELS[method], args.map(formatLogValue).join(" "));
    };
  }

  // 未捕获异常与未处理的 Promise 拒绝是最关键的排障线索，一并上报
  const onError = (event: ErrorEvent) => {
    // 资源加载失败的 error 事件没有 message，属噪音不上报
    if (event.message)
      report(
        "error",
        `Uncaught ${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`
      );
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    report("error", `UnhandledRejection ${formatLogValue(event.reason)}`);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    for (const method of Object.keys(originals) as ConsoleMethodName[])
      console[method] = originals[method];
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
