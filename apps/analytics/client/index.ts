import {
  EVENT_TTL_MS,
  MAX_BATCH_EVENTS,
  MAX_BODY_BYTES,
  type AnalyticsEvent,
  type BatchReceipt,
  type EventBatch,
  type EventContext,
  type EventProperties,
} from "../contracts";
import { validateProperties } from "../contracts/events";

export interface AnalyticsState {
  schema_version: 1;
  installation_id: string;
  queue: AnalyticsEvent[];
}
export interface AnalyticsStorage {
  read(): Promise<unknown>;
  write(state: AnalyticsState): Promise<void>;
  legacyInstallationId?(): Promise<string | null>;
}
interface ClientOptions {
  endpoint: string;
  environment: EventBatch["environment"];
  context: () => EventContext;
  storage: AnalyticsStorage;
  id: () => string;
  fetch?: typeof fetch;
  now?: () => number;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
function queuedEvent(value: unknown): value is AnalyticsEvent {
  if (
    !record(value) ||
    !uuid.test(String(value.event_id)) ||
    !uuid.test(String(value.session_id)) ||
    typeof value.name !== "string" ||
    typeof value.event_version !== "number" ||
    typeof value.occurred_at !== "string" ||
    !Number.isFinite(Date.parse(value.occurred_at)) ||
    !record(value.context) ||
    !record(value.properties)
  )
    return false;
  return ["app_version", "os", "arch", "locale"].every(
    key => typeof (value.context as Record<string, unknown>)[key] === "string"
  );
}

export class AnalyticsClient {
  private state: AnalyticsState | null = null;
  private readonly sessionId: string;
  private writing: Promise<void> = Promise.resolve();
  private flushing: Promise<void> | null = null;
  private nextAttempt = 0;
  private failures = 0;

  constructor(private readonly options: ClientOptions) {
    this.sessionId = options.id();
  }
  private now() {
    return this.options.now?.() ?? Date.now();
  }

  async initialize(): Promise<boolean> {
    const input = await this.options.storage.read();
    if (input !== null) {
      if (
        !record(input) ||
        input.schema_version !== 1 ||
        typeof input.installation_id !== "string" ||
        !uuid.test(input.installation_id) ||
        !Array.isArray(input.queue)
      )
        throw new Error("埋点队列格式无效或版本不受支持");
      this.state = {
        schema_version: 1,
        installation_id: input.installation_id,
        queue: input.queue.filter(queuedEvent).slice(-2000),
      };
      return false;
    }
    const legacy = await this.options.storage.legacyInstallationId?.();
    const migrated = typeof legacy === "string" && uuid.test(legacy);
    this.state = {
      schema_version: 1,
      installation_id: migrated ? legacy : this.options.id(),
      queue: [],
    };
    return !migrated;
  }

  async track(name: string, input: Record<string, unknown> = {}): Promise<boolean> {
    if (!this.state) return false;
    const properties = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined)
    ) as EventProperties;
    if (!validateProperties(name, 1, properties)) return false;
    const event: AnalyticsEvent = {
      event_id: this.options.id(),
      session_id: this.sessionId,
      name,
      event_version: 1,
      occurred_at: new Date(this.now()).toISOString(),
      context: { ...this.options.context() },
      properties: { ...properties },
    };
    this.state.queue.push(event);
    this.state.queue = this.state.queue
      .filter(item => this.now() - Date.parse(item.occurred_at) <= EVENT_TTL_MS)
      .slice(-2000);
    await this.persist();
    return true;
  }

  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    const task = this.sendPending().finally(() => {
      this.flushing = null;
    });
    this.flushing = task;
    return task;
  }

  private persist(): Promise<void> {
    if (!this.state) throw new Error("埋点客户端尚未初始化");
    const snapshot = structuredClone(this.state);
    const task = this.writing
      .catch(() => undefined)
      .then(() => this.options.storage.write(snapshot));
    this.writing = task;
    return task;
  }

  private envelope(events: AnalyticsEvent[]): EventBatch {
    if (!this.state) throw new Error("埋点客户端尚未初始化");
    return {
      schema_version: 1,
      product: "tau-desktop",
      environment: this.options.environment,
      installation_id: this.state.installation_id,
      events,
    };
  }

  private async sendPending(): Promise<void> {
    if (!this.state || this.now() < this.nextAttempt) return;
    const queuedCount = this.state.queue.length;
    this.state.queue = this.state.queue.filter(
      item => this.now() - Date.parse(item.occurred_at) <= EVENT_TTL_MS
    );
    const candidates = [...this.state.queue];
    try {
      if (!candidates.length && queuedCount) await this.persist();
      for (let round = 0; candidates.length && round < 5; round++) {
        const events: AnalyticsEvent[] = [];
        while (candidates.length && events.length < MAX_BATCH_EVENTS) {
          const candidate = candidates[0];
          if (
            new TextEncoder().encode(JSON.stringify(this.envelope([...events, candidate])))
              .byteLength > MAX_BODY_BYTES
          ) {
            if (events.length) break;
            candidates.shift();
            this.state.queue = this.state.queue.filter(
              item => item.event_id !== candidate.event_id
            );
            continue;
          }
          events.push(candidate);
          candidates.shift();
        }
        await this.persist();
        if (!events.length) continue;
        const response = await (this.options.fetch ?? fetch)(this.options.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.envelope(events)),
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) throw new Error(`埋点上报 HTTP ${response.status}`);
        const body = (await response.json()) as { data?: BatchReceipt };
        const receipt = body.data;
        if (!receipt || !Array.isArray(receipt.accepted) || !Array.isArray(receipt.rejected))
          throw new Error("埋点回执格式无效");
        const sent = new Set(events.map(event => event.event_id));
        const accepted = new Set(receipt.accepted.filter(id => sent.has(id)));
        const rejected = receipt.rejected.flatMap(item =>
          item &&
          typeof item.event_id === "string" &&
          sent.has(item.event_id) &&
          typeof item.retryable === "boolean"
            ? [{ event_id: item.event_id, retryable: item.retryable }]
            : []
        );
        const acknowledged = new Set([...accepted, ...rejected.map(item => item.event_id)]);
        if (events.some(event => !acknowledged.has(event.event_id)))
          throw new Error("埋点回执缺少事件");
        const remove = new Set([
          ...accepted,
          ...rejected.filter(item => !item.retryable).map(item => item.event_id),
        ]);
        const retry = new Set(rejected.filter(item => item.retryable).map(item => item.event_id));
        this.state.queue = [
          ...this.state.queue.filter(
            item => !remove.has(item.event_id) && !retry.has(item.event_id)
          ),
          ...this.state.queue.filter(item => retry.has(item.event_id)),
        ];
        await this.persist();
      }
      this.failures = 0;
      this.nextAttempt = 0;
    } catch (error) {
      this.nextAttempt = this.now() + Math.min(900000, 20000 * 2 ** Math.min(this.failures++, 6));
      throw error;
    }
  }
}
