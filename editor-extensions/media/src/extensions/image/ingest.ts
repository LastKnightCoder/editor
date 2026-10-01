import { IResourceService } from "@tau/shared/host-services";
import { v4 as uuidv4 } from "uuid";
import { Editor } from "slate";

import { type IngestContext } from "@tau/editor/api";
import { notifierOf } from "@tau/editor/api";

import { createImageElement, insertInlineImage } from "../../utils/insertElement";
import { insertMediaBatch } from "../../utils/insertMediaBatch";
import { isParagraphAndEmpty } from "@tau/editor/api";
import { updateNodeByUuid } from "@tau/editor/api";

/**
 * 图片的 drop / paste 认领（01 §5.4 ingest）：drop 与空段落粘贴插块级图片，
 * 非空段落粘贴插行内图片（原 inline-image 插件的行为并入这里）。
 * 占位节点带 uuid，上传完成后按 uuid 回填——连续插入多个文件时路径会漂移，uuid 才可靠。
 */
async function uploadImageFile(
  ctx: IngestContext,
  file: File,
  uuid: string,
  asBlock: boolean
): Promise<void> {
  const { editor } = ctx;

  try {
    const url = await editor.getService(IResourceService).upload(file);
    if (!url) throw new Error("上传失败");
    if (
      !updateNodeByUuid(editor, uuid, asBlock ? "image" : "inline-image", {
        url,
        ...(asBlock ? { pasteUploading: false } : null),
      })
    ) {
      notifierOf(editor).error("图片更新失败");
    }
  } catch (error) {
    console.error("图片上传失败:", error);
    notifierOf(editor).error("图片上传失败");
    if (asBlock) {
      updateNodeByUuid(editor, uuid, "image", { pasteUploading: false });
    } else {
      updateNodeByUuid(editor, uuid, "inline-image", { url: "" });
    }
  }
}

export const imageIngestSpec = {
  files: {
    accept: "image/*",
    run: async (ctx: IngestContext) => {
      const asBlock = Boolean(ctx.point) || isParagraphAndEmpty(ctx.editor);
      let pending = (ctx.files ?? []).map(file => ({ file, uuid: uuidv4() }));
      if (asBlock) {
        const targets = insertMediaBatch(
          ctx.editor,
          pending.map(({ uuid }) => createImageElement({ url: "", uuid, pasteUploading: true }))
        );
        pending = pending.slice(0, targets.length);
        for (const target of targets) target.unref();
      } else {
        Editor.withoutNormalizing(ctx.editor, () => {
          for (const { uuid } of pending) insertInlineImage(ctx.editor, { url: "", uuid });
        });
      }
      for (const { file, uuid } of pending) {
        await uploadImageFile(ctx, file, uuid, asBlock);
      }
    },
  },
};
