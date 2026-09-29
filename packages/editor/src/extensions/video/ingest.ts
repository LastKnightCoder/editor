import { Editor, Element as SlateElement, Path, Transforms } from "slate";

import type { IngestContext } from "../../api/ingest";
import { notifierOf } from "../../services/editorNotifier";
import { IResourceService } from "../../services";
import { insertVideo } from "../../utils/insertElement";

/** 查找上传中的视频节点（src 为空且 uploading 为 true），优先匹配插入位置 */
function findUploadingVideoNode(editor: Editor, startPath: Path): [any, Path] | null {
  const nodeEntries = Array.from(
    Editor.nodes(editor, {
      at: [],
      match: (n: any) =>
        SlateElement.isElement(n) && n.type === "video" && n.src === "" && n.uploading === true,
    })
  );
  for (const entry of nodeEntries) {
    if (Path.equals(entry[1], startPath)) return entry as [any, Path];
  }
  return (nodeEntries[0] as [any, Path]) ?? null;
}

/**
 * 视频的 drop / paste 认领（01 §5.4 ingest）。失败行为沿用旧双插件的差异：
 * 粘贴失败清掉占位并补空段落（光标有落点），拖放失败保留占位仅结束上传态。
 */
async function ingestVideoFile(ctx: IngestContext, file: File): Promise<void> {
  const { editor, point } = ctx;
  const insertPath = insertVideo(editor, { src: "", uploading: true });
  if (!insertPath) return;

  try {
    const url = await editor.getService(IResourceService).upload(file);
    if (!url) throw new Error("上传失败");
    const nodeEntry = findUploadingVideoNode(editor, insertPath);
    if (nodeEntry) {
      Transforms.setNodes(editor, { src: url, uploading: false }, { at: nodeEntry[1] });
    } else {
      console.error("无法找到上传中的视频节点");
      notifierOf(editor).error("视频更新失败");
    }
  } catch (error) {
    console.error("视频上传失败:", error);
    notifierOf(editor).error("视频上传失败");
    const nodeEntry = point ? findUploadingVideoNode(editor, insertPath) : null;
    if (nodeEntry) {
      // 拖放：保留占位节点，结束上传态
      Transforms.setNodes(editor, { uploading: false }, { at: nodeEntry[1] });
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

export const videoIngestSpec = {
  files: {
    accept: "video/*",
    run: async (ctx: IngestContext) => {
      for (const file of ctx.files ?? []) {
        await ingestVideoFile(ctx, file);
      }
    },
  },
};
