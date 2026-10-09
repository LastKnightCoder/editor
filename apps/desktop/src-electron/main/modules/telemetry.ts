import { app, ipcMain, screen } from "electron";
import { randomUUID } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import log from "electron-log";
import { Module } from "../types/module";
import PathUtil from "../utils/PathUtil";

// Umami 自托管实例（stats.xiongtao.life）；website id 未配置时整个模块静默空转
const UMAMI_ENDPOINT = "https://stats.xiongtao.life/api/send";
// 置空即可整体停用上报
const UMAMI_WEBSITE_ID = "ae1b3d6f-0972-48ec-afb6-f1a8b7a79bd2";

const FLUSH_INTERVAL_MS = 20_000;
const HEARTBEAT_INTERVAL_MS = 5 * 60_000;
const MAX_QUEUE = 500;
const EVENT_TTL_MS = 7 * 24 * 60 * 60_000;
const QUIT_FLUSH_TIMEOUT_MS = 3_000;

interface QueuedEvent {
  name: string;
  data: Record<string, unknown>;
  url: string;
  createdAt: number;
}

interface TelemetryState {
  deviceId: string;
  queue: QueuedEvent[];
}

class TelemetryModule implements Module {
  name: string;

  private state: TelemetryState = { deviceId: "", queue: [] };
  private sessionStart = 0;
  private activeMs = 0;
  private activeSince = 0;
  private flushing = false;
  private persistTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.name = "telemetry";
  }

  async init(): Promise<void> {
    const firstRun = await this.loadState();

    // IPC 始终注册，渲染端不用关心埋点是否可用
    ipcMain.handle("telemetry:track", (_event, name: string, data?: Record<string, unknown>) => {
      this.track(name, data);
    });

    // 崩溃感知无条件注册（track 自身按 collectable 门控）：主进程异常当场入队，
    // native 级崩溃经落盘队列由下次启动补发
    this.setupCrashReporting();

    if (!this.collectable()) {
      log.info("TelemetryModule initialized (disabled)");
      return;
    }

    this.sessionStart = Date.now();
    app.on("browser-window-focus", () => this.markActivity(true));
    app.on("browser-window-blur", () => this.markActivity(false));

    this.track("session_start", {
      first_run: firstRun,
      app_version: app.getVersion(),
      os: process.platform,
      arch: process.arch,
      locale: app.getLocale(),
    });

    setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    // 心跳既是崩溃兜底（Umami 会话时长 = 会话内首末事件差），也携带活跃时长口径
    setInterval(() => {
      this.track("heartbeat", {
        uptime_ms: Date.now() - this.sessionStart,
        active_ms: Math.round(this.currentActiveMs()),
      });
    }, HEARTBEAT_INTERVAL_MS);

    // 受控退出（app-quit-controller）随后会 app.exit：尽力在窗口期内发完，
    // 发不完的事件已落盘，下次启动补发
    app.on("before-quit", () => {
      this.track("session_end", {
        duration_ms: Date.now() - this.sessionStart,
        active_ms: Math.round(this.currentActiveMs()),
      });
      void this.flush();
    });

    log.info("TelemetryModule initialized");
  }

  private collectable(): boolean {
    // 开发构建默认不上报（TAU_TELEMETRY_DEBUG=1 可强制），避免污染统计
    const packaged = app.isPackaged || process.env.TAU_TELEMETRY_DEBUG === "1";
    return packaged && UMAMI_WEBSITE_ID.length > 0;
  }

  private track(name: string, data?: Record<string, unknown>): void {
    if (!this.collectable()) return;
    const url = typeof data?.page === "string" ? `/page/${data.page}` : `/`;
    this.state.queue.push({ name, data: data ?? {}, url, createdAt: Date.now() });
    if (this.state.queue.length > MAX_QUEUE) {
      this.state.queue.splice(0, this.state.queue.length - MAX_QUEUE);
    }
    this.schedulePersist();
  }

  private markActivity(focused: boolean): void {
    if (focused) {
      if (this.activeSince === 0) this.activeSince = Date.now();
    } else if (this.activeSince !== 0) {
      this.activeMs += Date.now() - this.activeSince;
      this.activeSince = 0;
    }
  }

  private setupCrashReporting(): void {
    const sanitize = (text: unknown): string => {
      const home = PathUtil.getHomeDir();
      // 报文进统计端前抹掉本机用户名等路径信息
      return String(text ?? "")
        .replaceAll(home, "~")
        .slice(0, 300);
    };
    const reportCrash = (data: Record<string, unknown>) => {
      this.track("crash", data);
      // 崩溃场景不等防抖，立即落盘防进程随后退出丢失
      void this.persist();
    };
    process.on("uncaughtException", error => {
      reportCrash({ kind: "uncaught_exception", stack: sanitize(error?.stack) });
    });
    process.on("unhandledRejection", reason => {
      reportCrash({ kind: "unhandled_rejection", stack: sanitize(reason) });
    });
    app.on("render-process-gone", (_event, _webContents, details) => {
      reportCrash({
        kind: "render_process_gone",
        reason: details.reason,
        exit_code: details.exitCode,
      });
    });
    app.on("child-process-gone", (_event, details) => {
      reportCrash({
        kind: "child_process_gone",
        type: details.type,
        reason: details.reason,
        exit_code: details.exitCode,
      });
    });
  }

  private currentActiveMs(): number {
    return this.activeSince !== 0 ? this.activeMs + (Date.now() - this.activeSince) : this.activeMs;
  }

  private async flush(): Promise<void> {
    if (this.flushing || !this.collectable()) return;
    this.flushing = true;
    try {
      const now = Date.now();
      this.state.queue = this.state.queue.filter(event => now - event.createdAt < EVENT_TTL_MS);
      while (this.state.queue.length > 0) {
        const event = this.state.queue[0];
        try {
          await this.send(event);
        } catch (error) {
          // 失败保留队首等下轮重试，避免单点故障时丢掉后续事件
          log.debug(`telemetry send failed (${event.name}):`, error);
          break;
        }
        this.state.queue.shift();
      }
      this.schedulePersist();
    } finally {
      this.flushing = false;
    }
  }

  private async send(event: QueuedEvent): Promise<void> {
    const display = screen.getPrimaryDisplay().size;
    const response = await fetch(UMAMI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Umami 以「IP + UA」哈希判定访客身份：UA 内嵌匿名设备 id，访客去重才不受 IP 变化影响
        "User-Agent": `Tau/${app.getVersion()} (${process.platform}; ${process.arch}) Device/${this.state.deviceId}`,
      },
      body: JSON.stringify({
        payload: {
          website: UMAMI_WEBSITE_ID,
          hostname: "tau-desktop",
          screen: `${display.width}x${display.height}`,
          language: app.getLocale(),
          url: event.url,
          referrer: "",
          ip: "",
        },
        type: "event",
        event_name: event.name,
        event_data: event.data,
      }),
      signal: AbortSignal.timeout(QUIT_FLUSH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persist();
    }, 2_000);
  }

  private async persist(): Promise<void> {
    try {
      await fsp.writeFile(this.stateFile(), JSON.stringify(this.state), "utf-8");
    } catch (error) {
      log.warn("telemetry persist failed:", error);
    }
  }

  private stateFile(): string {
    return path.join(PathUtil.getAppDir(), "telemetry.json");
  }

  /** 恢复设备身份与离线队列；返回是否首次生成设备 id */
  private async loadState(): Promise<boolean> {
    try {
      const raw = await fsp.readFile(this.stateFile(), "utf-8");
      const parsed = JSON.parse(raw) as Partial<TelemetryState>;
      if (typeof parsed.deviceId === "string" && parsed.deviceId)
        this.state.deviceId = parsed.deviceId;
      if (Array.isArray(parsed.queue)) this.state.queue = parsed.queue.filter(this.isQueuedEvent);
    } catch {
      /* 首次启动或文件损坏：重建 */
    }
    if (!this.state.deviceId) {
      this.state.deviceId = randomUUID();
      await this.persist();
      return true;
    }
    return false;
  }

  private isQueuedEvent(value: unknown): value is QueuedEvent {
    const event = value as Partial<QueuedEvent>;
    return typeof event?.name === "string" && typeof event?.createdAt === "number";
  }
}

const telemetryModule = new TelemetryModule();
export default telemetryModule;
