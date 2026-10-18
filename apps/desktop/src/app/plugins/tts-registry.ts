import type { PluginContext, TTSProviderDefinition, TTSInstance, Disposable } from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import type { TTSRendererRequest, TTSSessionInfo } from "../../../shared/tts-renderer";

interface Registration {
  context: PluginContext;
  definition: TTSProviderDefinition;
}
interface Session {
  registration: Registration;
  instance: TTSInstance;
  controller: AbortController;
}

export class RendererTTSRegistry {
  private readonly registrations = new Map<string, Registration>();
  private readonly sessions = new Map<string, Session>();
  register(context: PluginContext, definition: TTSProviderDefinition): Disposable {
    if (this.registrations.has(context.pluginId)) throw new Error("语音提供方已注册");
    const registration = { context, definition };
    this.registrations.set(context.pluginId, registration);
    const release = () => {
      if (this.registrations.get(context.pluginId) === registration)
        this.registrations.delete(context.pluginId);
      for (const [id, session] of this.sessions)
        if (session.registration === registration) this.close(id);
    };
    context.signal.addEventListener("abort", release, { once: true });
    return {
      dispose: () => {
        context.signal.removeEventListener("abort", release);
        release();
      },
    };
  }
  close(id: string) {
    const session = this.sessions.get(id);
    this.sessions.delete(id);
    session?.controller.abort(new DOMException("语音任务已结束或插件已停用", "AbortError"));
  }
  async execute(request: TTSRendererRequest, callSignal: AbortSignal): Promise<unknown> {
    callSignal.throwIfAborted();
    if (request.kind === "close") {
      this.close(request.session);
      return;
    }
    if (request.kind === "open") {
      if (this.sessions.has(request.session)) throw new Error("语音任务已存在");
      const registration = this.registrations.get(request.pluginId);
      if (!registration || registration.context.signal.aborted)
        throw new Error("语音插件未安装或未启用");
      const instance = registration.definition.create(copyJson(request.config), request.modelId);
      if (
        !instance ||
        typeof instance.getVoices !== "function" ||
        typeof instance.synthesize !== "function"
      )
        throw new Error("语音提供方实现不完整");
      this.sessions.set(request.session, {
        registration,
        instance,
        controller: new AbortController(),
      });
      return {
        textInstructions: instance.textInstructions,
        canClone: typeof instance.cloneVoice === "function",
      } satisfies TTSSessionInfo;
    }
    const session = this.sessions.get(request.session);
    if (!session) throw new DOMException("语音任务已结束", "AbortError");
    const signal = AbortSignal.any([
      callSignal,
      session.controller.signal,
      session.registration.context.signal,
    ]);
    signal.throwIfAborted();
    let abort!: () => void;
    const canceled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
    });
    try {
      const operation = Promise.resolve().then<unknown>(() => {
        signal.throwIfAborted();
        switch (request.kind) {
          case "voices":
            return session.instance.getVoices(signal);
          case "synthesize":
            return session.instance.synthesize(structuredClone(request.request), signal);
          case "clone":
            if (!session.instance.cloneVoice) throw new Error("当前模型不支持音色复刻");
            return session.instance.cloneVoice(
              {
                ...request.request,
                file: {
                  ...request.request.file,
                  content: new Uint8Array(request.request.file.content),
                },
              },
              signal
            );
        }
      });
      const result = await Promise.race([operation, canceled]);
      signal.throwIfAborted();
      return result;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
}
export const rendererTTSRegistry = new RendererTTSRegistry();
