import { v4 as uuidv4 } from "uuid";

import type { IngestContext } from "../../api/ingest";
import { notifierOf } from "../../services/editorNotifier";
import { IResourceService } from "../../services";
import { insertImage, insertInlineImage } from "../../utils/insertElement";
import { isParagraphAndEmpty } from "../../utils/editor";
import { updateNodeByUuid } from "../../utils/nodeOperations";

/**
 * 图片的 drop / paste 认领（01 §5.4 ingest）：drop 与空段落粘贴插块级图片，
 * 非空段落粘贴插行内图片（原 inline-image 插件的行为并入这里）。
 * 占位节点带 uuid，上传完成后按 uuid 回填——连续插入多个文件时路径会漂移，uuid 才可靠。
 */
async function ingestImageFile(ctx: IngestContext, file: File): Promise<void> {
  const { editor, point } = ctx;
  const uuid = uuidv4();
  const asBlock = Boolean(point) || isParagraphAndEmpty(editor);

  if (asBlock) {
    if (!insertImage(editor, { url: "", uuid, pasteUploading: true })) return;
  } else {
    insertInlineImage(editor, { url: "", uuid });
  }

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
      for (const file of ctx.files ?? []) {
        await ingestImageFile(ctx, file);
      }
    },
  },
};
