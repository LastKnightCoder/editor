import { textFormattingCodec } from "@tau/editor/extensions/text-formatting/markdown";
import { mobileCodecComposition } from "../../services/editorMarkdown";
import { mobileContentPlugins } from "../../app/plugins/content";
import { getMobileContentKit } from "../../services/editorKit";
import { createEmptyEditorContent } from "../cards/editorContentUtils";

/** 与桌面端 Markdown 导入同口径：忽略 YAML 头；解析为空时给一个空段落，保证可渲染、可落库 */
export async function parseIncomingMarkdown(markdown: string) {
  const extensions = getMobileContentKit().extensions;
  const processor = await mobileContentPlugins.prepareMarkdown(extensions, {
    contracts: {},
    codecs: mobileCodecComposition,
    textCodecs: [textFormattingCodec],
  });
  const parsed = await processor.importDocument(markdown, ["yaml"]);
  const catalog = await mobileContentPlugins.prepareEditorContracts(extensions);
  return catalog.createDocument(
    parsed.content.length ? parsed.content : createEmptyEditorContent(),
    parsed.contracts
  );
}
