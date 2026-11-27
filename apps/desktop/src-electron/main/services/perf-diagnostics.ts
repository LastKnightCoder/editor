import type { PerfCpuCapture } from "../../../shared/perf-cpu";
import {
  PERF_EVENT_BYTES,
  PERF_TIMELINE_BYTES,
  PERF_TIMELINE_MS,
  parsePerfInput,
  type PerfEvent,
  type PerfIncident,
  type PerfInput,
  type PerfSource,
  type PerfSummary,
} from "../../../shared/perf-diagnostics";

export function summarizePerf(events: readonly PerfEvent[]): PerfSummary {
  const stages = new Map<string, PerfSummary["slowStages"][number]>();
  const active = new Map<string, { operationId: string; label: string; pid: number }>();
  const processes = new Map<number, PerfSummary["processes"][number]>();
  let errors = 0;
  for (const event of events) {
    const { kind, ms, label = kind, operationId, source, values = {} } = event;
    if (kind === "exception" || event.status === "error") errors++;
    const key = `${source.pid}:${operationId}`;
    if (operationId && kind === "operation-start")
      active.set(key, { operationId, label, pid: source.pid });
    if (operationId && kind === "operation-end") active.delete(key);
    if (ms !== undefined && ["stage", "ipc", "db-command", "operation-end"].includes(kind)) {
      const stageKey = `${source.pid}:${kind}:${label}`;
      const row = stages.get(stageKey) ?? {
        label: `${kind}:${label}`,
        pid: source.pid,
        count: 0,
        totalMs: 0,
        maxMs: 0,
      };
      row.count++;
      row.totalMs += ms;
      if (ms >= row.maxMs) {
        row.maxMs = ms;
        row.context = event.context;
        row.operationId = operationId;
      }
      stages.set(stageKey, row);
    }
    const process = processes.get(source.pid) ?? {
      pid: source.pid,
      maxCpuCorePercent: 0,
      maxRssMB: 0,
      maxHeapMB: 0,
    };
    process.maxCpuCorePercent = Math.max(process.maxCpuCorePercent, values.cpuCorePercent ?? 0);
    process.maxRssMB = Math.max(process.maxRssMB, values.rssMB ?? 0);
    process.maxHeapMB = Math.max(process.maxHeapMB, values.usedMB ?? values.heapUsedMB ?? 0);
    processes.set(source.pid, process);
  }
  return {
    from: events.length ? Math.min(...events.map(event => event.t)) : null,
    to: events.length ? Math.max(...events.map(event => event.t)) : null,
    events: events.length,
    errors,
    slowStages: [...stages.values()].sort((a, b) => b.maxMs - a.maxMs).slice(0, 12),
    unfinished: [...active.values()].slice(0, 32),
    processes: [...processes.values()].slice(0, 32),
  };
}

interface Options {
  now?: () => number;
  timelineMs?: number;
  maxBytes?: number;
  beforeMs?: number;
  afterMs?: number;
  cooldownMs?: number;
  onIncident?: (incident: PerfIncident) => void;
}

/** 纯状态机：采集时间与事件起点分开，延迟上报的长任务不会破坏回看窗口。 */
export class PerfDiagnostics {
  private rows: Array<{ event: PerfEvent; bytes: number }> = [];
  private bytes = 0;
  private sequence = 0;
  private started: number;
  private pending?: { incident: PerfIncident; bytes: number };
  private recent: PerfIncident[] = [];
  private cooldown = new Map<string, number>();
  private cpu = new Map<number, { since: number; last: number }>();
  private heaps = new Map<number, Array<{ t: number; mb: number }>>();
  private operations = new Map<string, { event: PerfEvent; noticed: boolean }>();
  dropped = 0;
  suppressed = 0;
  callbackFailures = 0;
  expiredOperations = 0;
  upstreamDropped = 0;
  readonly now: () => number;

  constructor(
    readonly sessionId: string,
    private readonly options: Options = {}
  ) {
    this.now = options.now ?? Date.now;
    this.started = this.now();
  }

  record(input: PerfInput, source: PerfSource): void {
    const now = this.now();
    this.tick(now);
    const parsed = parsePerfInput(input);
    if (!parsed) {
      this.dropped++;
      return;
    }
    const event: PerfEvent = {
      ...parsed,
      id: ++this.sequence,
      receivedAt: now,
      source: { ...source },
    };
    const bytes = Buffer.byteLength(JSON.stringify(event));
    if (bytes > PERF_EVENT_BYTES) {
      this.dropped++;
      return;
    }
    if (event.kind === "collector") this.upstreamDropped += Math.max(0, event.values?.dropped ?? 0);
    this.rows.push({ event, bytes });
    this.bytes += bytes;
    this.prune(now);
    if (event.operationId) {
      const key = `${source.pid}:${event.operationId}`;
      if (event.kind === "operation-start") {
        if (this.operations.size >= 128) {
          this.operations.delete(this.operations.keys().next().value as string);
          this.expiredOperations++;
        }
        this.operations.set(key, { event, noticed: false });
      }
      if (event.kind === "operation-end") this.operations.delete(key);
    }
    if (this.pending) {
      if (this.pending.bytes + bytes <= this.maxBytes) {
        this.pending.incident.events.push(event);
        this.pending.bytes += bytes;
      } else this.pending.incident.dropped++;
    }
    const reason = this.signal(event);
    if (reason) this.trigger(event, reason, now);
  }

  private get maxBytes() {
    return this.options.maxBytes ?? PERF_TIMELINE_BYTES;
  }

  private prune(now: number) {
    const cutoff = now - (this.options.timelineMs ?? PERF_TIMELINE_MS);
    let removed = 0;
    while (
      removed < this.rows.length &&
      (this.rows[removed].event.receivedAt < cutoff || this.bytes > this.maxBytes)
    ) {
      this.bytes -= this.rows[removed++].bytes;
    }
    if (removed) {
      this.dropped += this.rows
        .slice(0, removed)
        .filter(row => row.event.receivedAt >= cutoff).length;
      this.rows.splice(0, removed);
    }
  }

  private signal(event: PerfEvent): string | undefined {
    if (event.kind === "unresponsive") return "window-unresponsive";
    if (event.kind === "exception")
      return event.label === "react-loop" ? "react-loop" : "exception";
    if (["event-loop", "longtask", "interaction"].includes(event.kind) && (event.ms ?? 0) >= 500)
      return "ui-blocked";
    if (
      ["ipc", "db-command", "stage", "operation-end", "sync-io"].includes(event.kind) &&
      (event.ms ?? 0) >= 1000
    )
      return "slow-operation";
    const pid = event.source.pid;
    if (event.kind === "resource") {
      if ((event.values?.cpuCorePercent ?? 0) >= 80) {
        const previous = this.cpu.get(pid);
        const since =
          previous && event.receivedAt - previous.last <= 10_000
            ? previous.since
            : event.receivedAt;
        this.cpu.set(pid, { since, last: event.receivedAt });
        if (event.receivedAt - since >= 15_000) return "sustained-cpu";
      } else this.cpu.delete(pid);
      if (this.cpu.size > 64) this.cpu.delete(this.cpu.keys().next().value as number);
    }
    const mb = event.kind === "heap" ? event.values?.usedMB : undefined;
    if (mb !== undefined) {
      const rows = (this.heaps.get(pid) ?? []).filter(row => event.receivedAt - row.t <= 30_000);
      const baseline = rows[0];
      rows.push({ t: event.receivedAt, mb });
      this.heaps.set(pid, rows.slice(-8));
      if (this.heaps.size > 64) this.heaps.delete(this.heaps.keys().next().value as number);
      if (baseline && mb - baseline.mb >= 128) return "heap-growth";
    }
  }

  private trigger(event: PerfEvent, reason: string, now: number) {
    if (this.pending) {
      const reasons = this.pending.incident.reasons;
      const match = reasons.find(row => row.reason === reason && row.pid === event.source.pid);
      if (match) match.count++;
      else if (reasons.length < 16) reasons.push({ reason, pid: event.source.pid, count: 1 });
      return;
    }
    const key = `${event.source.pid}:${reason}`;
    if ((this.cooldown.get(key) ?? -Infinity) > now) {
      this.suppressed++;
      return;
    }
    const events = this.rows.filter(
      row => row.event.receivedAt >= now - (this.options.beforeMs ?? 60_000)
    );
    const incident: PerfIncident = {
      id: `${now}-${this.sequence}`,
      sessionId: this.sessionId,
      startedAt: now,
      endsAt: now + (this.options.afterMs ?? 30_000),
      status: "recording",
      reasons: [{ reason, pid: event.source.pid, count: 1 }],
      events: events.map(row => row.event),
      summary: summarizePerf(events.map(row => row.event)),
      dropped: 0,
      beforeAvailableMs: Math.min(now - this.started, now - (events[0]?.event.receivedAt ?? now)),
    };
    this.pending = { incident, bytes: events.reduce((sum, row) => sum + row.bytes, 0) };
    this.notifyIncident(incident);
  }

  private notifyIncident(incident: PerfIncident) {
    try {
      this.options.onIncident?.(structuredClone(incident));
    } catch {
      this.callbackFailures++;
    }
  }

  tick(now = this.now()): void {
    this.prune(now);
    if (this.pending && now >= this.pending.incident.endsAt) this.finish(false, now);
    for (const [key, value] of this.operations) {
      if (!value.noticed && now - value.event.receivedAt >= 8000) {
        value.noticed = true;
        this.trigger(value.event, "unfinished-operation", now);
      }
      if (now - value.event.receivedAt > PERF_TIMELINE_MS) {
        this.operations.delete(key);
        this.expiredOperations++;
      }
    }
  }

  finish(interrupted = true, now = this.now()): void {
    if (!this.pending) return;
    const incident = this.pending.incident;
    incident.status = interrupted ? "interrupted" : "complete";
    incident.summary = summarizePerf(incident.events);
    this.pending = undefined;
    this.recent.push(incident);
    this.recent = this.recent.slice(-3);
    for (const row of incident.reasons)
      this.cooldown.set(`${row.pid}:${row.reason}`, now + (this.options.cooldownMs ?? 300_000));
    for (const [key, until] of this.cooldown) if (until < now) this.cooldown.delete(key);
    this.notifyIncident(incident);
  }

  updateCpu(incidentId: string, value: PerfCpuCapture): void {
    const incident =
      this.pending?.incident.id === incidentId
        ? this.pending.incident
        : this.recent.find(row => row.id === incidentId);
    if (!incident) return;
    incident.cpu = value;
    this.notifyIncident(incident);
  }

  snapshot() {
    this.tick();
    const events = this.rows.map(row => row.event);
    return {
      events,
      summary: summarizePerf(events),
      incidents: this.pending
        ? [
            ...this.recent,
            {
              ...this.pending.incident,
              summary: summarizePerf(this.pending.incident.events),
            },
          ]
        : this.recent,
      collector: {
        bytes: this.bytes,
        dropped: this.dropped,
        suppressed: this.suppressed,
        callbackFailures: this.callbackFailures,
        expiredOperations: this.expiredOperations,
        upstreamDropped: this.upstreamDropped,
      },
    };
  }
}
