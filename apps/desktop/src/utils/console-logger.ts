// 渲染进程 console 劫持：重写 console.* 方法，保留原输出行为的同时转发主进程，
// 由主进程写入 session 日志文件。Web 环境无主进程通道，跳过安装保留原生 console

type ConsoleMethodName = "log" | "info" | "warn" | "error" | "debug";

// console 方法到日志级别的映射（console.log 归并为 info）
const CONSOLE_LEVELS: Record<ConsoleMethodName, "debug" | "info" | "warn" | "error"> = {
  log: "info",
  info: "info",
  warn: "warn",
  error: "error",
  debug: "debug",
};

// 单条日志长度上限，防止大对象刷爆 IPC 与日志文件
const MAX_MESSAGE_LENGTH = 4000;
// 限流：每窗口每秒最多上报条数，超出丢弃，日志风暴时保住主进程与日志文件
const RATE_LIMIT_PER_SECOND = 100;
const RATE_WINDOW_MS = 1000;

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // 循环引用、DOM 节点等无法 JSON 序列化的值退化为 toString
    return String(value);
  }
}

export function setupConsoleLogger(): void {
  const bridge = window.electron;
  if (!bridge?.sendLog) {
    return;
  }

  let windowStart = Date.now();
  let sentCount = 0;
  let droppedCount = 0;

  const report = (level: string, message: string) => {
    const now = Date.now();
    if (now - windowStart >= RATE_WINDOW_MS) {
      if (droppedCount > 0) {
        bridge.sendLog("warn", `[console-logger] 触发限流，上一秒丢弃了 ${droppedCount} 条日志`);
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
    bridge.sendLog(
      level,
      message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message
    );
  };

  for (const method of Object.keys(CONSOLE_LEVELS) as ConsoleMethodName[]) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      original(...args);
      report(CONSOLE_LEVELS[method], args.map(formatValue).join(" "));
    };
  }

  // 未捕获异常与未处理的 Promise 拒绝是最关键的排障线索，一并上报
  window.addEventListener("error", event => {
    // 资源加载失败的 error 事件没有 message，属噪音不上报
    if (event.message) {
      report(
        "error",
        `Uncaught ${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`
      );
    }
  });
  window.addEventListener("unhandledrejection", event => {
    report("error", `UnhandledRejection ${formatValue(event.reason)}`);
  });
}
