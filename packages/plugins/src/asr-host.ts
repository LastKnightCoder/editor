import {
  waitForASR,
  validateTranscript,
  type ASRInstance,
  type ASRRunOptions,
  type ASRStreamRequest,
  type ASRStreamSession,
} from "@tau/asr";
import type { ASRProviderDefinition } from "./asr";
import type { Disposable, JsonValue, PluginContext } from "./contract";

interface Registration {
  context: PluginContext;
  definition: ASRProviderDefinition;
  controller: AbortController;
}
export class ASRProviderRegistry {
  private entries = new Map<string, Registration>();
  private listeners = new Set<() => void>();
  private revision = 0;
  getSnapshot = () => this.revision;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private changed() {
    this.revision++;
    for (const listener of this.listeners) listener();
  }
  list() {
    return [...this.entries.values()];
  }
  register(context: PluginContext, definition: ASRProviderDefinition): Disposable {
    if (this.entries.has(context.pluginId)) throw new Error("语音识别提供方已注册");
    const registration = { context, definition, controller: new AbortController() };
    this.entries.set(context.pluginId, registration);
    this.changed();
    const release = () => {
      registration.controller.abort(new Error("识别提供方已注销"));
      if (this.entries.get(context.pluginId) === registration) {
        this.entries.delete(context.pluginId);
        this.changed();
      }
    };
    context.signal.addEventListener("abort", release, { once: true });
    return {
      dispose: () => {
        context.signal.removeEventListener("abort", release);
        release();
      },
    };
  }
  create(
    pluginId: string,
    config: JsonValue,
    modelId: string
  ): { instance: ASRInstance; signal: AbortSignal } {
    const registered = this.entries.get(pluginId);
    if (!registered || registered.context.signal.aborted) throw new Error("语音识别插件未启用");
    return {
      instance: registered.definition.create(structuredClone(config), modelId),
      signal: AbortSignal.any([registered.context.signal, registered.controller.signal]),
    };
  }
  async openStream(
    pluginId: string,
    config: JsonValue,
    modelId: string,
    request: ASRStreamRequest,
    options: ASRRunOptions
  ): Promise<ASRStreamSession> {
    const { instance, signal: pluginSignal } = this.create(pluginId, config, modelId);
    if (!instance.openStream) throw new Error("所选识别插件不支持实时输入");
    const lifetime = new AbortController();
    const signal = AbortSignal.any([pluginSignal, options.signal, lifetime.signal]);
    const opening = instance.openStream(request, {
      ...options,
      signal,
      onEvent: event => {
        if (!signal.aborted) options.onEvent(event);
      },
    });
    void opening
      .then(session => {
        if (signal.aborted) return session.cancel();
      })
      .catch(() => undefined);
    const session = await waitForASR(opening, signal);
    const abort = () => {
      void session.cancel().catch(() => undefined);
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const result = waitForASR(session.result, signal)
      .then(value => {
        validateTranscript(value);
        return value;
      })
      .finally(() => signal.removeEventListener("abort", abort));
    void result.catch(() => undefined);
    return {
      result,
      async write(frame) {
        signal.throwIfAborted();
        await session.write(frame);
      },
      async endInput() {
        signal.throwIfAborted();
        await session.endInput();
      },
      async cancel() {
        lifetime.abort();
        await session.cancel();
      },
    };
  }
}
