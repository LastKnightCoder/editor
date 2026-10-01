import { Editor, Element, type Path } from "slate";
import { v4 as uuid } from "uuid";
import { isParagraphAndEmpty, captureEditorSubmission, type IngestContext } from "@tau/editor/api";
import {
  createImageElement,
  createAudioElement,
  createVideoElement,
  insertInlineImage,
} from "./insertElement";
import { insertMediaBatch } from "./insertMediaBatch";
import { beginMediaSubmission } from "./mediaSubmission";
import { uploadMedia } from "./uploadMedia";
import type { ImageElement, InlineImageElement, AudioElement, VideoElement } from "../types";

export async function ingestMedia(ctx: IngestContext, kind: "image" | "audio" | "video") {
  const { editor } = ctx;
  const files = ctx.files ?? [];
  const batch = captureEditorSubmission(editor);
  const pending: Array<ReturnType<typeof beginMediaSubmission>> = [];
  const capture = (path: Path) => {
    const [node] = Editor.node(editor, path);
    pending.push(
      beginMediaSubmission(
        editor,
        node as ImageElement | InlineImageElement | AudioElement | VideoElement,
        { path }
      )
    );
  };
  try {
    if (batch.check()) return;
    if (kind === "image" && !ctx.point && !isParagraphAndEmpty(editor)) {
      Editor.withoutNormalizing(editor, () => {
        for (let index = 0; index < files.length; index++) {
          const id = uuid();
          insertInlineImage(editor, { url: "", uuid: id });
          // 同步插入后立即捕获，异步返回时不再凭 UUID 搜索认领。
          const [entry] = Editor.nodes(editor, {
            at: [],
            match: node =>
              Element.isElement(node) && node.type === "inline-image" && node.uuid === id,
          });
          if (entry) capture(entry[1]);
          else pending.push(null);
        }
      });
    } else {
      const targets = insertMediaBatch(
        editor,
        files.map(file =>
          kind === "image"
            ? createImageElement({ url: "" })
            : kind === "audio"
              ? createAudioElement({ src: "", title: file.name })
              : createVideoElement({ src: "" })
        )
      );
      try {
        for (const target of targets) {
          if (target.current) capture(target.current);
          else pending.push(null);
        }
      } finally {
        for (const target of targets) target.unref();
      }
    }
    for (const [index, submission] of pending.entries())
      await uploadMedia(
        editor,
        files[index],
        submission,
        kind !== "image" && !ctx.point ? "paragraph" : "keep"
      );
  } finally {
    for (const submission of pending) submission?.dispose();
    batch.dispose();
  }
}
