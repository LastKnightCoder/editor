import type { PluginServices } from "@tau/plugins";
import { compilerFiles, invokeCompiler } from "@/services/plugin-compiler-client";

export const desktopPluginServices: PluginServices = {
  tailwind: {
    compile: (input, options) =>
      invokeCompiler(
        { kind: "tailwind", source: input.source, language: input.language ?? "tsx" },
        options
      ),
  },
  typst: {
    compile: async (input, options) => {
      if (input.format && input.format !== "html") throw new Error("当前 Typst 服务仅支持 HTML");
      return invokeCompiler(
        {
          kind: "typst",
          source: input.source,
          inputs: input.inputs ?? {},
          files: await compilerFiles(input.files ?? [], options?.signal),
        },
        options
      );
    },
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
    probe: async (input, options) =>
      invokeCompiler(
        { kind: "probe", file: (await compilerFiles([input], options?.signal))[0] },
        options
      ),
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
};
