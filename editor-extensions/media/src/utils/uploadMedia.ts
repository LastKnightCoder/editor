import { Editor, Transforms } from "slate";
import { createParagraph, notifierOf } from "@tau/editor/api";
import { beginMediaSubmission } from "./mediaSubmission";

export async function uploadMedia(
  editor: Editor,
  file: File,
  submission: ReturnType<typeof beginMediaSubmission>,
  failure: "keep" | "paragraph" = "keep"
): Promise<boolean> {
  if (!submission) return false;
  try {
    if (submission.check()) return false;
    let url: string;
    try {
      url = await submission.upload(file);
      if (!url) throw new Error("上传失败");
    } catch (error) {
      if (submission.check()) return false;
      const outcome = submission.commit(({ element, path }) => {
        if (failure === "paragraph") {
          Editor.withoutNormalizing(editor, () => {
            Transforms.removeNodes(editor, { at: path });
            Transforms.insertNodes(editor, createParagraph(), { at: path, select: true });
          });
        } else if (element.type === "image") {
          Transforms.setNodes(editor, { pasteUploading: false }, { at: path });
        } else if (element.type !== "inline-image") {
          Transforms.setNodes(editor, { uploading: false }, { at: path });
        }
      });
      if (outcome.status === "committed") {
        console.error("上传媒体失败:", error);
        notifierOf(editor).error("上传失败");
      }
      return false;
    }
    return (
      submission.commit(({ element, path }) => {
        const patch =
          element.type === "image"
            ? { url, pasteUploading: false }
            : element.type === "inline-image"
              ? { url }
              : element.type === "audio"
                ? { src: url, uploading: false, title: element.title || file.name }
                : { src: url, uploading: false };
        Transforms.setNodes(editor, patch, { at: path });
      }).status === "committed"
    );
  } finally {
    submission.dispose();
  }
}
