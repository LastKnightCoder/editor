import { Editor, Transforms } from "slate";

import type { IngestContext } from "../../api/ingest";
import { notifierOf } from "../../services/editorNotifier";
import { IResourceService } from "../../services";
import { insertAudio } from "../../utils/insertElement";

/**
 * 音频的 drop / paste 认领（01 §5.4 ingest）。失败行为沿用旧双插件的差异：
 * 粘贴失败清掉占位并补空段落（光标有落点），拖放失败保留占位仅结束上传态。
 */
async function ingestAudioFile(ctx: IngestContext, file: File): Promise<void> {
  const { editor, point } = ctx;
  const insertPath = insertAudio(editor, {
    src: "",
    title: file.name,
    uploading: true,
  });
  if (!insertPath) return;

  try {
    const src = await editor.getService(IResourceService).upload(file);
    if (!src) throw new Error("上传失败");
    Transforms.setNodes(editor, { src, uploading: false }, { at: insertPath });
  } catch (error) {
    console.error("音频上传失败:", error);
    notifierOf(editor).error("上传失败");
    if (point) {
      // 拖放：保留占位节点，结束上传态
      Transforms.setNodes(editor, { uploading: false }, { at: insertPath });
      return;
    }
    // 粘贴：删占位、补空段落承接光标
    Editor.withoutNormalizing(editor, () => {
      Transforms.delete(editor, { at: insertPath });
      Transforms.insertNodes(
        editor,
        { type: "paragraph", children: [{ type: "formatted", text: "" }] },
        { at: insertPath, select: true }
      );
    });
  }
}

export const audioIngestSpec = {
  files: {
    accept: "audio/*",
    run: async (ctx: IngestContext) => {
      for (const file of ctx.files ?? []) {
        await ingestAudioFile(ctx, file);
      }
    },
  },
};
