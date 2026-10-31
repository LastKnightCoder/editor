import type {
  Disposable,
  JsonValue,
  PluginContext,
  VideoInstance,
  VideoPlaybackSource,
  VideoProviderDefinition,
  ResolvedVideo,
  VideoRef,
  VideoCaptions,
} from "@tau/plugins";
import { copyJson } from "@tau/plugins/host";
import type {
  VideoProvidersState,
  VideoRendererRequest,
  VideoRendererResults,
} from "../../../shared/video-renderer";

interface Registration {
  context: PluginContext;
  definition: VideoProviderDefinition;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const optionalText = (value: unknown) => (typeof value === "string" && value ? value : undefined);

/** 逐字段归一插件结果：可选字段允许缺省或为 undefined，引用须为纯 JSON。 */
function validateResolved(value: ResolvedVideo): ResolvedVideo {
  if (!isRecord(value) || typeof value.title !== "string")
    throw new Error("插件返回的视频信息无效");
  if (!Array.isArray(value.variants) || value.variants.length === 0)
    throw new Error("插件未返回可选的清晰度");
  const variants = value.variants.map(variant => {
    if (!isRecord(variant) || typeof variant.label !== "string" || !isRecord(variant.ref))
      throw new Error("插件返回的清晰度无效");
    const hint = optionalText(variant.hint);
    return {
      label: variant.label,
      ...(hint ? { hint } : {}),
      ref: copyJson(variant.ref as JsonValue) as VideoRef,
    };
  });
  const cover = optionalText(value.cover);
  const index = value.defaultVariant;
  return {
    title: value.title,
    ...(cover ? { cover } : {}),
    variants,
    ...(Number.isInteger(index) && index! >= 0 && index! < variants.length
      ? { defaultVariant: index }
      : {}),
  };
}

const isStream = (value: unknown) => isRecord(value) && typeof value.url === "string";

const stream = (value: { url: string; headers?: Record<string, string> }) => ({
  url: value.url,
  ...(isRecord(value.headers)
    ? {
        headers: Object.fromEntries(
          Object.entries(value.headers).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        ),
      }
    : {}),
});

function validatePlayback(value: VideoPlaybackSource): VideoPlaybackSource {
  if (isRecord(value) && value.kind === "file" && isStream(value.stream))
    return { kind: "file", stream: stream(value.stream) };
  if (isRecord(value) && value.kind === "split" && isStream(value.video) && isStream(value.audio))
    return { kind: "split", video: stream(value.video), audio: stream(value.audio) };
  if (isRecord(value) && value.kind === "extract" && typeof value.url === "string") {
    const videoFormat = optionalText(value.videoFormat);
    const audioFormat = optionalText(value.audioFormat);
    const proxy = optionalText(value.proxy);
    return {
      kind: "extract",
      url: value.url,
      ...(videoFormat ? { videoFormat } : {}),
      ...(audioFormat ? { audioFormat } : {}),
      ...(proxy ? { proxy } : {}),
    };
  }
  throw new Error("插件返回的播放源无效");
}

function validateCaptions(value: VideoCaptions | null): VideoCaptions | null {
  if (value === null) return null;
  if (!isRecord(value) || !Array.isArray(value.segments)) throw new Error("插件返回的字幕无效");
  const segments = value.segments
    .map(segment => {
      if (
        !isRecord(segment) ||
        typeof segment.text !== "string" ||
        typeof segment.start !== "number" ||
        typeof segment.end !== "number" ||
        !Number.isFinite(segment.start) ||
        !Number.isFinite(segment.end) ||
        segment.start < 0 ||
        segment.end <= segment.start
      )
        throw new Error("插件返回的字幕时间戳无效");
      return { text: segment.text.trim(), start: segment.start, end: segment.end };
    })
    .filter(segment => segment.text)
    .sort((a, b) => a.start - b.start);
  if (!segments.length) return null;
  const language = optionalText(value.language);
  return { ...(language ? { language } : {}), segments };
}

/** 视频提供方只在主窗口渲染进程执行，每次调用按当前插件配置创建实例。 */
export class RendererVideoRegistry {
  private readonly registrations = new Map<string, Registration>();
  private readonly listeners = new Set<() => void>();
  private ready = false;

  constructor(private readonly readConfig: (pluginId: string) => JsonValue) {}

  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error("视频提供方变更通知失败", error);
      }
    }
  }

  state(): VideoProvidersState {
    return {
      ready: this.ready,
      providers: [...this.registrations.values()].map(({ definition }) => ({
        id: definition.id,
        name: definition.name,
      })),
    };
  }

  /** 首次插件激活完成后调用，此后缺少的提供方视为未安装或未启用。 */
  markReady() {
    if (this.ready) return;
    this.ready = true;
    this.notify();
  }

  register(context: PluginContext, definition: VideoProviderDefinition): Disposable {
    if (this.registrations.has(context.pluginId)) throw new Error("插件已注册视频提供方");
    const registration = { context, definition };
    this.registrations.set(context.pluginId, registration);
    this.notify();
    return {
      dispose: () => {
        if (this.registrations.get(context.pluginId) !== registration) return;
        this.registrations.delete(context.pluginId);
        this.notify();
      },
    };
  }

  private instance(pluginId: string): { instance: VideoInstance; signal: AbortSignal } {
    const registration = this.registrations.get(pluginId);
    if (!registration || registration.context.signal.aborted)
      throw new Error(`需要在插件中心安装并启用「${pluginId}」插件`);
    return {
      instance: registration.definition.create(copyJson(this.readConfig(pluginId) ?? {})),
      signal: registration.context.signal,
    };
  }

  /** 插件停用或调用方取消时立即结束，迟到的插件结果被丢弃。 */
  private async run<T>(
    pluginId: string,
    callSignal: AbortSignal | undefined,
    execute: (instance: VideoInstance, signal: AbortSignal) => T | Promise<T>
  ): Promise<T> {
    const { instance, signal: lifetime } = this.instance(pluginId);
    const signal = AbortSignal.any([lifetime, ...(callSignal ? [callSignal] : [])]);
    signal.throwIfAborted();
    let onAbort = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new DOMException("插件已停用或请求已取消", "AbortError"));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return await Promise.race([aborted, Promise.resolve().then(() => execute(instance, signal))]);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  async execute<K extends VideoRendererRequest["kind"]>(
    request: Extract<VideoRendererRequest, { kind: K }>,
    signal?: AbortSignal
  ): Promise<VideoRendererResults[K]>;
  async execute(request: VideoRendererRequest, signal?: AbortSignal): Promise<unknown> {
    switch (request.kind) {
      case "match":
        if (request.pluginId)
          return this.instance(request.pluginId).instance.matches(request.url)
            ? request.pluginId
            : null;
        for (const pluginId of this.registrations.keys()) {
          try {
            if (this.instance(pluginId).instance.matches(request.url)) return pluginId;
          } catch (error) {
            console.error(`视频插件 ${pluginId} 识别链接失败`, error);
          }
        }
        return null;
      case "resolve":
        return validateResolved(
          await this.run(request.pluginId, signal, (instance, scoped) =>
            instance.resolve(request.url, scoped)
          )
        );
      case "cacheKey": {
        const key = await this.run(request.pluginId, signal, instance =>
          instance.cacheKey(copyJson(request.ref) as VideoRef)
        );
        if (typeof key !== "string" || !key) throw new Error("插件返回的缓存身份无效");
        return key;
      }
      case "playback":
        return validatePlayback(
          await this.run(request.pluginId, signal, (instance, scoped) =>
            instance.getPlayback(copyJson(request.ref) as VideoRef, scoped)
          )
        );
      case "captions":
        return validateCaptions(
          await this.run(
            request.pluginId,
            signal,
            (instance, scoped) =>
              instance.getCaptions?.(copyJson(request.ref) as VideoRef, scoped) ?? null
          )
        );
    }
  }
}
