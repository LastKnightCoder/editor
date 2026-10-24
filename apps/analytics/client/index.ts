import { type VersionObservation, type VersionReport } from "../contracts";

export interface AnalyticsState {
  schema_version: 2;
  installation_id: string;
  confirmed: VersionObservation | null;
  pending: VersionObservation | null;
}
export interface AnalyticsStorage {
  read(): Promise<unknown>;
  write(state: AnalyticsState): Promise<void>;
}
interface ClientOptions {
  endpoint: string;
  environment: VersionReport["environment"];
  storage: AnalyticsStorage;
  id: () => string;
  fetch?: typeof fetch;
  now?: () => number;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const observation = (value: unknown): value is VersionObservation =>
  record(value) &&
  Object.keys(value).every(key => key === "app_version" || key === "reported_at") &&
  typeof value.app_version === "string" &&
  typeof value.reported_at === "string" &&
  Number.isFinite(Date.parse(value.reported_at));
const day = (time: number) => new Date(time + 8 * 3600000).toISOString().slice(0, 10);

export class VersionClient {
  private state: AnalyticsState | null = null;
  private sending: Promise<void> | null = null;

  constructor(private readonly options: ClientOptions) {}

  async initialize(): Promise<void> {
    const input = await this.options.storage.read();
    if (input !== null) {
      if (
        !record(input) ||
        !uuid.test(String(input.installation_id)) ||
        ![1, 2].includes(input.schema_version as number)
      )
        throw new Error("版本上报状态格式无效或版本不受支持");
      if (
        input.schema_version === 2 &&
        !(
          (input.confirmed === null || observation(input.confirmed)) &&
          (input.pending === null || observation(input.pending))
        )
      )
        throw new Error("版本上报状态格式无效");
      this.state = {
        schema_version: 2,
        installation_id: input.installation_id as string,
        confirmed:
          input.schema_version === 2 ? (input.confirmed as VersionObservation | null) : null,
        pending: input.schema_version === 2 ? (input.pending as VersionObservation | null) : null,
      };
    } else {
      this.state = {
        schema_version: 2,
        installation_id: this.options.id(),
        confirmed: null,
        pending: null,
      };
    }
    await this.persist();
  }

  report(appVersion: string): Promise<void> {
    if (this.sending) return this.sending;
    const task = this.send(appVersion).finally(() => {
      this.sending = null;
    });
    this.sending = task;
    return task;
  }

  private persist(): Promise<void> {
    if (!this.state) throw new Error("版本上报尚未初始化");
    return this.options.storage.write(structuredClone(this.state));
  }

  private async send(appVersion: string): Promise<void> {
    if (!this.state) throw new Error("版本上报尚未初始化");
    const now = this.options.now?.() ?? Date.now();
    const matches = (value: VersionObservation | null) =>
      value?.app_version === appVersion && day(Date.parse(value.reported_at)) === day(now);
    if (matches(this.state.confirmed)) return;
    if (!matches(this.state.pending))
      this.state.pending = { app_version: appVersion, reported_at: new Date(now).toISOString() };
    await this.persist();
    const pending = this.state.pending!;
    const payload: VersionReport = {
      schema_version: 1,
      product: "tau-desktop",
      environment: this.options.environment,
      installation_id: this.state.installation_id,
      app_version: pending.app_version,
      reported_at: pending.reported_at,
    };
    const response = await (this.options.fetch ?? fetch)(this.options.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`版本上报 HTTP ${response.status}`);
    const receipt = (await response.json()) as { data?: VersionObservation };
    if (
      receipt.data?.app_version !== pending.app_version ||
      receipt.data.reported_at !== pending.reported_at
    )
      throw new Error("版本上报回执无效");
    const confirmed = this.state.confirmed;
    this.state.confirmed = pending;
    this.state.pending = null;
    try {
      await this.persist();
    } catch (error) {
      this.state.confirmed = confirmed;
      this.state.pending = pending;
      throw error;
    }
  }
}
