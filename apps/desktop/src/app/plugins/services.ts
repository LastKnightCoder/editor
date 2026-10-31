import type { PluginServices } from "@tau/plugins";
import { compilerFiles, invokeCompiler } from "@/services/plugin-compiler-client";
import { invoke } from "@/electron";
import { withModule } from "@/commands/module-init";
import { publishGitSnapshot, selectGitCacheDirectory } from "@/commands/publish-git";

export const desktopPluginServices: PluginServices = {
  git: {
    publishSnapshot: publishGitSnapshot,
    selectCacheDirectory: () => selectGitCacheDirectory(),
  },
  tailwind: {
    compile: (input, options) =>
      invokeCompiler(
        { kind: "tailwind", source: input.source, language: input.language ?? "tsx" },
        options
      ),
  },
  markdown: {
    deserialize: async (source, options) =>
      (await import("@/services/plugin-markdown")).pluginMarkdown.deserialize(source, options),
    serialize: async (nodes, options) =>
      (await import("@/services/plugin-markdown")).pluginMarkdown.serialize(nodes, options),
    render: async (source, options) =>
      (await import("@/services/plugin-markdown")).pluginMarkdown.render(source, options),
  },
  ffmpeg: {
    run: async (input, options) => {
      const result = await invokeCompiler<{
        files: { name: string; mimeType: string; bytes: Uint8Array }[];
        log: string;
      }>(
        {
          kind: "ffmpeg",
          files: await compilerFiles(input.files, options?.signal),
          args: input.args,
          outputs: input.outputs,
        },
        options
      );
      return {
        log: result.log,
        files: result.files.map(file => ({
          name: file.name,
          data: new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }),
        })),
      };
    },
  },
  videoExtractor: {
    probe: (url, options) =>
      withModule("online-video-cache", () => invoke("video-extractor:probe", url, options?.proxy)),
    getCaptions: (url, options) =>
      invokeCompiler({ kind: "video-captions", url, proxy: options?.proxy }, options),
  },
};
