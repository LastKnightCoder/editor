import { Check } from "typebox/value";
import type { TSchema } from "typebox";
import {
  AiError,
  type AiInteractionMode,
  type AiSessionRef,
  type AiToolExecutionContext,
  type AiToolExecutor,
  type AiToolResult,
  type AiToolRisk,
  type AiToolSpec,
} from "../contracts";

export type ToolPermissionMode = "manual" | "acceptEdits" | "bypass";
export type AiToolApprovalChoice = "allow" | "allow-session" | "deny";
export interface AiToolApprovalRequest {
  requestId: string;
  context: AiToolExecutionContext;
  tool: Readonly<AiToolSpec>;
  input: unknown;
}
export interface AiToolExecutionOptions {
  interactionMode: AiInteractionMode;
  permissionMode?: ToolPermissionMode;
  approve?: (request: AiToolApprovalRequest) => Promise<AiToolApprovalChoice>;
}
export type AiToolRegistrationSpec = Omit<AiToolSpec, "risk"> & { risk?: AiToolRisk };

export const normalizeToolPermissionMode = (value: unknown): ToolPermissionMode =>
  value === "acceptEdits" || value === "bypass" ? value : "manual";

export const requiresToolApproval = (risk: AiToolRisk | undefined, mode: ToolPermissionMode) => {
  const effectiveRisk = risk ?? "execute";
  if (effectiveRisk === "read" || mode === "bypass") return false;
  return effectiveRisk === "write" ? mode === "manual" : true;
};

function freezeJson<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === "object") {
    if (seen.has(value)) return value;
    seen.add(value);
    for (const entry of Object.values(value)) freezeJson(entry, seen);
    Object.freeze(value);
  }
  return value;
}

function unavailable(message = "工具已停用或定义已变化") {
  return new AiError("AI_TOOL_UNAVAILABLE", message);
}

export function waitForSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => undefined);
    return Promise.reject(signal.reason ?? new DOMException("已取消", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("已取消", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

type Registration = {
  spec: Readonly<AiToolSpec>;
  execute: AiToolExecutor;
  token: string;
  controller: AbortController;
};

const sessionKey = (session: AiSessionRef) =>
  JSON.stringify([session.databaseName, session.sessionId]);

export interface AiToolSnapshot {
  readonly specs: readonly Readonly<AiToolSpec>[];
  isCurrent(): boolean;
  execute(
    id: string,
    input: unknown,
    context: AiToolExecutionContext,
    options: AiToolExecutionOptions
  ): Promise<AiToolResult>;
}

export class AiToolRegistry {
  private readonly registrations = new Map<string, Registration>();
  private readonly granted = new Map<string, Set<string>>();

  register(spec: AiToolRegistrationSpec, execute: AiToolExecutor): () => void {
    if (!spec.id || !spec.sourceId || !spec.executionIdentity)
      throw unavailable("工具必须声明稳定身份、来源和执行身份");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(spec.name)) throw unavailable("模型工具名无效");
    if (
      this.registrations.has(spec.id) ||
      [...this.registrations.values()].some(value => value.spec.name === spec.name)
    )
      throw unavailable("工具身份或模型调用名重复");
    const risk = spec.risk ?? "execute";
    if (!["read", "write", "execute"].includes(risk)) throw unavailable("工具风险类型无效");
    const registration: Registration = {
      spec: freezeJson(structuredClone({ ...spec, risk })),
      execute,
      token: crypto.randomUUID(),
      controller: new AbortController(),
    };
    this.registrations.set(spec.id, registration);
    return () => {
      if (this.registrations.get(spec.id) !== registration) return;
      this.registrations.delete(spec.id);
      registration.controller.abort(unavailable());
      for (const granted of this.granted.values()) granted.delete(registration.token);
    };
  }

  list(): readonly Readonly<AiToolSpec>[] {
    return [...this.registrations.values()].map(value => value.spec);
  }

  revokeSession(session: AiSessionRef): void {
    this.granted.delete(sessionKey(session));
  }

  clearPermissions(): void {
    this.granted.clear();
  }

  capture(ids: readonly string[]): AiToolSnapshot {
    const captured = new Map<string, Registration>();
    for (const id of ids) {
      const registration = this.registrations.get(id);
      if (!registration) throw unavailable(`工具不可用：${id}`);
      captured.set(id, registration);
    }
    const current = (id: string, registration: Registration) =>
      this.registrations.get(id) === registration;
    return {
      specs: Object.freeze([...captured.values()].map(value => value.spec)),
      isCurrent: () => [...captured].every(([id, registration]) => current(id, registration)),
      execute: async (id, input, context, options) => {
        const registration = captured.get(id);
        if (!registration || !current(id, registration)) throw unavailable();
        context.signal.throwIfAborted();
        const args: unknown = freezeJson(structuredClone(input));
        let valid = false;
        try {
          valid = Check(registration.spec.inputSchema as TSchema, args);
        } catch {
          /* 无效 Schema 不放行执行。 */
        }
        if (!valid)
          throw new AiError("AI_TOOL_ARGUMENT_INVALID", "工具参数不符合声明的 JSON Schema");
        const controller = new AbortController();
        const signals = [context.signal, registration.controller.signal];
        const abort = (event: Event) => controller.abort((event.target as AbortSignal).reason);
        for (const signal of signals) {
          if (signal.aborted) controller.abort(signal.reason);
          else signal.addEventListener("abort", abort, { once: true });
        }
        let started = false;
        try {
          const key = sessionKey(context.session);
          const mode = normalizeToolPermissionMode(options.permissionMode);
          const granted = this.granted.get(key)?.has(registration.token);
          if (requiresToolApproval(registration.spec.risk, mode) && !granted) {
            if (options.interactionMode !== "host" || !options.approve)
              throw new AiError(
                "AI_INTERACTION_UNAVAILABLE",
                "当前调用方无法承载工具审批，工具未执行"
              );
            const choice = await waitForSignal(
              options.approve({
                requestId: crypto.randomUUID(),
                context: { ...context, signal: controller.signal },
                tool: registration.spec,
                input: args,
              }),
              controller.signal
            );
            if (choice !== "allow" && choice !== "allow-session")
              throw new AiError("AI_TOOL_DENIED", "用户拒绝工具执行");
            if (!current(id, registration)) throw unavailable();
            if (choice === "allow-session") {
              const allowed = this.granted.get(key) ?? new Set<string>();
              allowed.add(registration.token);
              this.granted.set(key, allowed);
            }
          }
          controller.signal.throwIfAborted();
          if (!current(id, registration)) throw unavailable();
          started = true;
          const result = await waitForSignal(
            registration.execute(args, {
              ...context,
              signal: controller.signal,
            }),
            controller.signal
          );
          if (!current(id, registration)) throw unavailable();
          if (!result || typeof result.content !== "string")
            throw new Error("工具未返回有效的结果文本");
          return structuredClone(result);
        } catch (error) {
          if (started && controller.signal.aborted && registration.spec.risk !== "read")
            throw new AiError(
              "AI_TOOL_OUTCOME_UNKNOWN",
              "工具执行被中断，写入结果未知，不能自动重放",
              false,
              { toolId: id }
            );
          throw error;
        } finally {
          for (const signal of signals) signal.removeEventListener("abort", abort);
        }
      },
    };
  }
}
