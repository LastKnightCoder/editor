import { CPU_DURATION_MS, CPU_INTERVAL_US, type PerfCpuCapture } from "../../../shared/perf-cpu";
import type { PerfIncident, PerfSource } from "../../../shared/perf-diagnostics";

type Result = Pick<PerfCpuCapture, "profile" | "summary" | "actualDurationMs" | "profileOmitted">;
export class PerfCpuScheduler {
  private active?: AbortController;
  private nextAllowed = 0;
  private attempts = 0;
  private closed = false;
  constructor(
    private options: {
      buildId: string;
      now?: () => number;
      capture: (source: PerfSource, signal: AbortSignal) => Promise<Result>;
      update: (id: string, value: PerfCpuCapture) => void;
    }
  ) {}

  consider(incident: PerfIncident) {
    if (incident.cpu || incident.status !== "recording" || this.closed) return;
    const now = (this.options.now ?? Date.now)();
    const reason =
      incident.reasons.find(row => row.reason === "sustained-cpu") ?? incident.reasons[0];
    const source = [...incident.events]
      .reverse()
      .find(event => event.source.pid === reason?.pid)?.source;
    const value: PerfCpuCapture = {
      buildId: this.options.buildId,
      pid: source?.pid ?? reason?.pid ?? 0,
      type: source?.type ?? "unknown",
      webContentsId: source?.webContentsId,
      status: "skipped",
      startedAt: now,
      intervalUs: CPU_INTERVAL_US,
      durationMs: CPU_DURATION_MS,
    };
    const skip =
      !source || !["main", "renderer"].includes(source.type)
        ? "unsupported-process"
        : this.active
          ? "busy"
          : this.attempts >= 6
            ? "session-budget"
            : now < this.nextAllowed
              ? "cooldown"
              : undefined;
    if (skip || !source) {
      this.options.update(incident.id, { ...value, reason: skip });
      return;
    }
    const controller = new AbortController();
    this.active = controller;
    this.nextAllowed = now + 300_000;
    this.attempts++;
    this.options.update(incident.id, { ...value, status: "recording" });
    void Promise.resolve()
      .then(() => this.options.capture(source, controller.signal))
      .then(
        result => {
          this.options.update(incident.id, {
            ...value,
            ...result,
            status: controller.signal.aborted ? "interrupted" : "complete",
            endedAt: (this.options.now ?? Date.now)(),
          });
        },
        error => {
          const reason =
            error instanceof Error && /^[a-z-]{1,60}$/.test(error.message)
              ? error.message
              : "capture-failed";
          this.options.update(incident.id, {
            ...value,
            status: controller.signal.aborted
              ? "interrupted"
              : ["inspector-busy", "debugger-busy"].includes(reason)
                ? "skipped"
                : "failed",
            reason,
            endedAt: (this.options.now ?? Date.now)(),
          });
        }
      )
      .finally(() => {
        if (this.active === controller) this.active = undefined;
      });
  }

  close() {
    this.closed = true;
    this.active?.abort();
  }
}
