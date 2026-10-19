import { createMarkdownProcessor } from "@tau/markdown";
import { textFormattingCodec } from "@tau/editor/extensions/text-formatting/markdown";
import { desktopCodecComposition, desktopMarkdown } from "@/utils/markdown";
import { desktopContentPlugins } from "../../shared/content-plugins.ts";
import type {
  Descendant,
  MarkdownServiceOptions,
  PluginServices,
  ServiceWarning,
} from "@tau/plugins";

function processor(options?: MarkdownServiceOptions) {
  const codecs = [...desktopCodecComposition, ...desktopContentPlugins.codecs];
  for (const codec of options?.codecs ?? []) {
    const index = codecs.findIndex(existing => existing.type === codec.type);
    if (index < 0) codecs.push(codec);
    else codecs[index] = codec;
  }
  return {
    codecs,
    markdown: options?.codecs?.length
      ? createMarkdownProcessor({ codecs, textCodecs: [textFormattingCodec] })
      : desktopMarkdown,
  };
}

function warningsFor(
  nodes: Descendant[],
  supported: (type: string) => boolean,
  html = false
): ServiceWarning[] {
  const warnings: ServiceWarning[] = [];
  const visit = (nodes: Descendant[], parent: number[]) =>
    nodes.forEach((node, index) => {
      const path = [...parent, index];
      if ("children" in node) {
        if (!supported(node.type))
          warnings.push({
            code: "UNSUPPORTED_NODE",
            message: `节点 ${node.type} 未配置专用转换器，将使用默认转换行为，请检查输出`,
            path,
          });
        if (html && ["tikz", "typst", "mermaid", "video", "audio"].includes(node.type))
          warnings.push({
            code: "DISPLAY_FALLBACK",
            message: `${node.type} 使用源码或链接展示，未自动执行专用编译器`,
            path,
          });
        visit(node.children, path);
      }
    });
  visit(nodes, []);
  return warnings;
}

export const pluginMarkdown: PluginServices["markdown"] = {
  async deserialize(source, options) {
    options?.signal?.throwIfAborted();
    const { markdown, codecs } = processor(options);
    const nodes = markdown.importFromMarkdown(source);
    options?.signal?.throwIfAborted();
    return {
      nodes,
      warnings: warningsFor(nodes, type => codecs.some(codec => codec.type === type)),
    };
  },
  async serialize(nodes, options) {
    options?.signal?.throwIfAborted();
    const { markdown, codecs } = processor(options);
    const supported = new Set(codecs.filter(codec => codec.serializer).map(codec => codec.type));
    const warnings = warningsFor(nodes, type => supported.has(type));
    const output = markdown.getMarkdown(structuredClone(nodes));
    options?.signal?.throwIfAborted();
    return { markdown: output, warnings };
  },
  async render(source, options) {
    options?.signal?.throwIfAborted();
    const { htmlSerializerRegistry } = await import("@/utils/html-serializers");
    options?.signal?.throwIfAborted();
    const nodes = processor(options).markdown.importFromMarkdown(source);
    const warnings = warningsFor(nodes, type => !!htmlSerializerRegistry.getSerializer(type), true);
    const css: string[] = [];
    const html = await htmlSerializerRegistry.serializeAsync(nodes, {
      theme: options?.theme,
      tailwindCssCollector: css,
    });
    options?.signal?.throwIfAborted();
    return { html, css: css.join("\n"), warnings };
  },
};
