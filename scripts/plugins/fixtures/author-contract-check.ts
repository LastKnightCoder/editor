// 此文件只注入独立作者验证工程，不随公开模板分发。
import { defineEditorElement, type EditorElementRenderProps } from "@tau/plugins";
import type { PluginContext, PluginExcerptItem, PluginExcerptSource } from "@tau/plugins";

export function checkTTSContract(context: PluginContext) {
  const handle = context.tts.register({
    id: context.pluginId,
    name: "语音",
    create: () => ({
      getVoices: async () => [],
      synthesize: async () => ({ audio: new Uint8Array(), mime: "audio/wav" }),
    }),
  });
  void context.upload.uploadRemote(
    { name: "voice.wav", mimeType: "audio/wav", content: new Uint8Array() },
    { signal: context.signal }
  );
  return handle;
}

export async function checkChatContract(context: PluginContext) {
  context.mcp.register({
    id: "chat",
    name: "展示数据",
    tools: [
      {
        name: "query",
        description: "查询",
        inputSchema: { type: "object" },
        execute: () => ({ content: "文本", render: { version: 1, data: { count: 1 } } }),
      },
    ],
  });
  const handle = await context.chat.registerToolRenderer({
    mcpId: "chat",
    toolName: "query",
    component: props => (props.dataVersion === 1 ? props.execution.output : props.renderDefault()),
  });
  await handle.dispose();
}

export async function checkServices(context: PluginContext) {
  const { nodes } = await context.services.markdown.deserialize("# 标题");
  await context.services.markdown.serialize(nodes);
  await context.services.markdown.render("**文字**");
  await context.services.tailwind.compile({ source: '<div class="p-4" />', language: "tsx" });
  await context.services.typst.compile({ source: "= 标题", format: "html" });
  const file = { name: "input.wav", data: new Blob() };
  await context.services.ffmpeg.probe(file);
  await context.services.ffmpeg.run(
    {
      files: [file],
      args: ["-i", "input.wav", "out.wav"],
      outputs: [{ name: "out.wav", mimeType: "audio/wav" }],
    },
    { onProgress: progress => void progress.time }
  );
}

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
