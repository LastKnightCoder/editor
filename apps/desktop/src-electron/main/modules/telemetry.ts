import { app, BrowserWindow, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import log from "electron-log";
import { AnalyticsClient } from "@tau/analytics/client";
import { Module } from "../types/module";
import PathUtil from "../utils/PathUtil";
import { FileAnalyticsStorage } from "../utils/analytics-storage";

const ANALYTICS_ENDPOINT = "https://analytics.taunote.app/v1/events/batch";

const FLUSH_INTERVAL_MS = 20_000;
const HEARTBEAT_INTERVAL_MS = 5 * 60_000;

class TelemetryModule implements Module {
  name: string;

  private client: AnalyticsClient | null = null;
  private sessionStart = 0;
  private activeMs = 0;
  private activeSince = 0;

  constructor() {
    this.name = "telemetry";
  }

  async init(): Promise<void> {
    // IPC 始终注册，渲染端不用关心埋点是否可用
    ipcMain.handle("telemetry:track", (_event, name: string, data?: Record<string, unknown>) => {
      this.track(name, data);
    });

    // 崩溃事件尽力落盘；native 崩溃仍需独立的 Crashpad 链路。
    this.setupCrashReporting();

    if (!this.collectable()) {
      log.info("TelemetryModule initialized (disabled)");
      return;
    }

    this.client = new AnalyticsClient({
      endpoint: process.env.TAU_ANALYTICS_ENDPOINT ?? ANALYTICS_ENDPOINT,
      environment: app.isPackaged ? "production" : "development",
      context: () => ({
        app_version: app.getVersion(),
        os: process.platform,
        arch: process.arch,
        locale: app.getLocale(),
      }),
      id: randomUUID,
      storage: new FileAnalyticsStorage(
        path.join(
          PathUtil.getAppDir(),
          app.isPackaged ? "analytics.json" : "analytics.development.json"
        ),
        path.join(
          PathUtil.getAppDir(),
          app.isPackaged ? "telemetry.json" : "telemetry.development.json"
        )
      ),
    });
    try {
      const firstRun = await this.client.initialize();
      this.sessionStart = Date.now();
      await this.client.track("session_start", { first_run: firstRun });
    } catch {
      this.client = null;
      log.warn("telemetry storage unavailable; reporting disabled");
      return;
    }

    const updateFocus = () =>
      this.markActivity(BrowserWindow.getAllWindows().some(window => window.isFocused()));
    updateFocus();
    app.on("browser-window-focus", updateFocus);
    app.on("browser-window-blur", () => setImmediate(updateFocus));

    setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    // 服务端按会话取累计最大值，乱序补报不会重复累加。
    setInterval(() => {
      this.track("heartbeat", {
        uptime_ms: Date.now() - this.sessionStart,
        active_ms: Math.round(this.currentActiveMs()),
      });
    }, HEARTBEAT_INTERVAL_MS);

    // 受控退出随后会 app.exit，只能尽力在窗口期内保存并发送退出事件。
    app.on("before-quit", () => {
      void this.client
        ?.track("session_end", {
          duration_ms: Date.now() - this.sessionStart,
          active_ms: Math.round(this.currentActiveMs()),
        })
        .then(() => this.flush())
        .catch(() => log.warn("telemetry quit persist failed"));
    });

    log.info("TelemetryModule initialized");
  }

  private collectable(): boolean {
    // 开发构建默认不上报（TAU_TELEMETRY_DEBUG=1 可强制），避免污染统计
    const packaged = app.isPackaged || process.env.TAU_TELEMETRY_DEBUG === "1";
    return packaged && process.env.TAU_TELEMETRY_DISABLED !== "1";
  }

  private track(name: string, data?: Record<string, unknown>): void {
    if (!this.collectable() || !this.client) return;
    void this.client.track(name, data).catch(() => log.warn("telemetry persist failed"));
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
    if (!this.collectable() || !this.client) return;
    try {
      await this.client.flush();
    } catch (error) {
      log.debug("telemetry flush deferred:", error);
    }
  }
}

const telemetryModule = new TelemetryModule();
export default telemetryModule;
