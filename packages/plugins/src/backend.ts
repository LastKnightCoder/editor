import type { JsonValue } from "./json";
export type { JsonValue } from "./json";
export type { PluginBackendManifest } from "./backend-manifest";

export type BackendState = "stopped" | "starting" | "running" | "draining" | "failed" | "blocked";
export interface BackendStatus {
  state: BackendState;
  generation?: string;
  pid?: number;
  error?: string;
  diagnostics?: { startedAt: number; startupMs?: number; failures: number; timeouts: number };
  resources?: { cpuPercent: number; memoryKiB: number };
}
export interface BackendDisposable {
  dispose(): void | Promise<void>;
}
export interface BackendSchema<T extends JsonValue = JsonValue> {
  parse(value: unknown): T;
}
export interface PluginBackendClient {
  call(method: string, input: JsonValue, options?: { signal?: AbortSignal }): Promise<JsonValue>;
  subscribe(event: string, listener: (value: JsonValue) => void): BackendDisposable;
  getState(): Promise<BackendStatus>;
}
export interface BackendContext {
  readonly process: {
    run(
      toolId: string,
      args?: readonly string[],
      options?: { signal?: AbortSignal }
    ): Promise<BackendProcessResult>;
  };
  readonly pluginId: string;
  readonly workspaceId: string | null;
  readonly signal: AbortSignal;
  register(resource: BackendDisposable): BackendDisposable;
  readonly rpc: {
    register<I extends JsonValue, O extends JsonValue>(
      method: string,
      schemas: { input: BackendSchema<I>; output: BackendSchema<O> },
      handler: (input: I, request: { signal: AbortSignal }) => O | Promise<O>
    ): BackendDisposable;
    emit(event: string, value: JsonValue): void;
  };
}
export interface BackendProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
export interface BackendDefinition {
  create(): {
    activate(context: BackendContext): void | Promise<void>;
    deactivate?(): void | Promise<void>;
  };
}
export function defineBackend(definition: BackendDefinition): BackendDefinition {
  return definition;
}
