import { createEditorKit } from "@tau/editor";
import { editorMarkdownCodecs } from "@tau/editor/markdown";
import { createMarkdownProcessor } from "@tau/markdown";
import type { PluginEditorContribution } from "@tau/plugins";

/** 注册时先完成装配校验，失败不得替换当前可用会话。 */
export function composePluginEditor(contributions: readonly PluginEditorContribution[]) {
  const codecs = [...editorMarkdownCodecs, ...contributions.flatMap(item => item.codecs ?? [])];
  const types = new Set<string>();
  const directives = new Set<string>();
  for (const codec of codecs) {
    if (types.has(codec.type)) throw new Error(`Markdown 类型重复：${codec.type}`);
    types.add(codec.type);
    for (const name of Object.keys(codec.directives ?? {})) {
      if (directives.has(name)) throw new Error(`Markdown directive 重复：${name}`);
      directives.add(name);
    }
  }
  return {
    kit: createEditorKit({ extensions: contributions.map(item => item.extension) }),
    markdown: createMarkdownProcessor({ codecs }),
  };
}
