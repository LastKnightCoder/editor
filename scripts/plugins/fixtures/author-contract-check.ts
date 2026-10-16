// 此文件只注入独立作者验证工程，不随公开模板分发。
import { defineEditorElement, type EditorElementRenderProps } from "@tau/plugins";
import type { PluginContext, PluginExcerptItem, PluginExcerptSource } from "@tau/plugins";

export async function checkExcerptContract(context: PluginContext) {
  const source: PluginExcerptSource = { key: "book-1", title: "示例书籍" };
  const item: PluginExcerptItem = { externalId: "book-1:note-1", quote: "示例划线" };
  const registration = context.excerpts.register({ label: "示例阅读" });
  await context.excerpts.replace(source, [item]);
  await context.excerpts.patch(source, { upsert: [item] });
  await context.excerpts.sources();
  for (const entry of await context.excerpts.items(source.key)) {
    for (const action of await context.materials.actions(entry.ref)) await action.run();
  }
  registration.dispose();
}

declare module "@tau/plugins" {
  interface EditorElementMap {
    "example.external-counter.note": {
      type: "example.external-counter.note";
      children: { text: string }[];
    };
  }
}

defineEditorElement({
  type: "example.external-counter.note",
  kind: "block",
  render: (props: EditorElementRenderProps) => props.children,
});

// @ts-expect-error 宿主入口不对独立作者开放。
import type { PluginHost } from "@tau/plugins/host";
// @ts-expect-error 内部编辑器包不成为作者依赖。
import type { EditorKit } from "@tau/editor";
type Forbidden = PluginHost | EditorKit;
export type { Forbidden };
