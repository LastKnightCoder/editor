import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";
import type { GitSnapshotRequest, GitCacheDirectory } from "./publish";
import type { VideoCaptions } from "./video";

export type { Descendant } from "slate";

export interface ServiceOptions {
  signal?: AbortSignal;
}

export interface ServiceWarning {
  code: string;
  message: string;
  path?: number[];
}

export interface ServiceFile {
  /** 任务内的相对文件名，不是宿主文件路径。 */
  name: string;
  data: Blob;
}

export interface MarkdownServiceOptions extends ServiceOptions {
  /** 仅参与本次转换，不修改全局编辑器。 */
  codecs?: readonly MarkdownCodec[];
}

export interface MediaProgress {
  /** 已处理的媒体时间，单位秒；不推测总时长或百分比。 */
  time: number;
}

export interface VideoFormat {
  id: string;
  /** 只含视频或只含音频的流；两者都为 false 时是音视频合一的流。 */
  videoOnly: boolean;
  audioOnly: boolean;
  ext?: string;
  width?: number;
  height?: number;
  fps?: number;
  /** 码率，单位 kbps。 */
  bitrate?: number;
  size?: number;
  note?: string;
}

export interface VideoProbeResult {
  title: string;
  cover?: string;
  duration?: number;
  formats: VideoFormat[];
}

export interface PluginServices {
  git: {
    publishSnapshot(input: GitSnapshotRequest, options?: ServiceOptions): Promise<void>;
    selectCacheDirectory(
      input: Record<string, never>,
      options?: ServiceOptions
    ): Promise<GitCacheDirectory | null>;
  };
  tailwind: {
    compile(
      input: { source: string; language?: "html" | "tsx" | "jsx" },
      options?: ServiceOptions
    ): Promise<{ css: string }>;
  };
  markdown: {
    deserialize(
      source: string,
      options?: MarkdownServiceOptions
    ): Promise<{ nodes: Descendant[]; warnings: ServiceWarning[] }>;
    serialize(
      nodes: Descendant[],
      options?: MarkdownServiceOptions
    ): Promise<{ markdown: string; warnings: ServiceWarning[] }>;
    render(
      source: string,
      options?: MarkdownServiceOptions & { theme?: "light" | "dark" }
    ): Promise<{ html: string; css: string; warnings: ServiceWarning[] }>;
  };
  ffmpeg: {
    /** args 中用任务文件名引用输入和输出；不接受 shell 命令。 */
    run(
      input: {
        files: ServiceFile[];
        args: string[];
        outputs: { name: string; mimeType: string }[];
      },
      options?: ServiceOptions & { onProgress?: (progress: MediaProgress) => void }
    ): Promise<{ files: ServiceFile[]; log: string }>;
  };
  /** 宿主视频解析器（yt-dlp）；视频下载经播放源交给宿主。 */
  videoExtractor: {
    probe(url: string, options?: ServiceOptions & { proxy?: string }): Promise<VideoProbeResult>;
    getCaptions(
      url: string,
      options?: ServiceOptions & { proxy?: string }
    ): Promise<VideoCaptions | null>;
  };
}

/** 每个调用同时受调用方与插件实例生命周期约束。 */
export function bindPluginServices(
  adapter: PluginServices | undefined,
  lifetime: AbortSignal,
  assertActive: () => void
): PluginServices {
  const bind =
    <A, O extends ServiceOptions, R>(
      execute: ((input: A, options?: O) => Promise<R>) | undefined
    ) =>
    async (input: A, options?: O): Promise<R> => {
      assertActive();
      if (!execute) throw new Error("当前宿主未提供编译与转换服务");
      const signal = AbortSignal.any([lifetime, ...(options?.signal ? [options.signal] : [])]);
      signal.throwIfAborted();
      const result = await execute(input, { ...options, signal } as O);
      signal.throwIfAborted();
      assertActive();
      return result;
    };
  return Object.freeze({
    git: Object.freeze({
      publishSnapshot: bind(adapter?.git?.publishSnapshot),
      selectCacheDirectory: bind(adapter?.git?.selectCacheDirectory),
    }),
    tailwind: Object.freeze({ compile: bind(adapter?.tailwind?.compile) }),
    markdown: Object.freeze({
      deserialize: bind(adapter?.markdown?.deserialize),
      serialize: bind(adapter?.markdown?.serialize),
      render: bind(adapter?.markdown?.render),
    }),
    ffmpeg: Object.freeze({ run: bind(adapter?.ffmpeg?.run) }),
    videoExtractor: Object.freeze({
      probe: bind(adapter?.videoExtractor?.probe),
      getCaptions: bind(adapter?.videoExtractor?.getCaptions),
    }),
  });
}
