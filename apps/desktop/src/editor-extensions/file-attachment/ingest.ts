import type { IngestContext } from "@tau/editor";
import { notifierOf } from "@tau/editor";
import { uploadResource } from "@/hooks/useUploadResource";
import { insertFileAttachment } from "./utils";

/**
 * 文件拖入 / 粘贴的兜底认领（01 §5.4 ingest）：image / audio / video 已被内置
 * 扩展按 MIME 认领，其余文件（PDF、压缩包、文档…）上传后插入为附件块。
 * accept "*" 的分桶排在所有精确声明之后——宿主扩展列表在内置扩展之后装配。
 */
export const fileAttachmentIngestSpec = {
  files: {
    accept: "*",
    run: async (ctx: IngestContext) => {
      for (const file of ctx.files ?? []) {
        try {
          const url = await uploadResource(file);
          if (!url) throw new Error("上传失败");
          await insertFileAttachment(ctx.editor, url, false, file.name);
        } catch (error) {
          console.error("附件上传失败:", error);
          notifierOf(ctx.editor).error(`「${file.name}」上传失败`);
        }
      }
    },
  },
};
