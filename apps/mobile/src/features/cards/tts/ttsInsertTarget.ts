import {
  captureElementSubmission,
  captureInsertionSubmission,
  createParagraph,
  notifierOf,
  setOrInsertNode,
  type Submission,
} from "@tau/editor/api";
import type { AudioElement } from "@tau/editor/extensions/media";
import { IResourceService } from "@tau/shared/host-services";
import {
  Editor as SlateEditor,
  Element as SlateElement,
  Node as SlateNode,
  Path,
  Range,
  Transforms,
  type Element as ElementNode,
} from "slate";
import { HistoryEditor } from "slate-history";

/** 单次合成的字数上限：取各服务商单次请求上限中最保守的值 */
export const TTS_MAX_TEXT_LENGTH = 1000;

/** 语速四档：手机上滑杆难以精确，常用值也就这几档 */
export const TTS_SPEEDS = [0.8, 1, 1.25, 1.5] as const;

/** 生成面板的打开方式：决定预填文本与生成后落到文档的位置 */
export type TtsInsertIntent =
  /** 插入面板：在光标处新插音频块 */
  | { kind: "insert" }
  /** 选中文字：预填选中内容，插到选区最后一个顶层块之后 */
  | { kind: "after-selection"; text: string }
  /** 已有音频：重新生成或替换，原地改写该音频块 */
  | { kind: "replace"; element: ElementNode; path?: Path; text: string };

/** 已锁定的写入位置：打开面板时捕获，生成期间文档变化由 Submission 判定是否仍可写入 */
export type TtsInsertTarget = {
  /** 每次打开唯一，面板据此重置内部状态 */
  readonly id: string;
  readonly intent: TtsInsertIntent;
  readonly signal: AbortSignal;
  /** 上传音频并写入文档；目标失效返回 false */
  commit: (audio: TtsGeneratedAudio) => Promise<boolean>;
  dispose: () => void;
};

export type TtsGeneratedAudio = {
  blob: Blob;
  text: string;
};

const CANNOT_INSERT_HINT = "插入位置已变化，请重新打开后再试";

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/aac": "aac",
  "audio/flac": "flac",
};

/** 标题取文本前 12 个字（单行化），过长加省略号 */
export function ttsAudioTitle(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  const head = Array.from(line).slice(0, 12).join("");
  return `${head}${Array.from(line).length > 12 ? "…" : ""} · 朗读`;
}

export function ttsAudioFile(blob: Blob): File {
  const mime = blob.type || "audio/mpeg";
  const extension = EXTENSION_BY_MIME[mime] ?? "mp3";
  return new File([blob], `tts-${Date.now()}.${extension}`, { type: mime });
}

/** 选区展开时取纯文本（跨块以换行连接），折叠或无选区为空串 */
export function selectedPlainText(editor: SlateEditor): string {
  const { selection } = editor;
  if (!selection || Range.isCollapsed(selection)) return "";
  const [start, end] = Range.edges(selection);
  const blocks = Array.from(
    SlateEditor.nodes(editor, {
      at: selection,
      match: (node, path) =>
        SlateElement.isElement(node) &&
        SlateEditor.isBlock(editor, node) &&
        !SlateEditor.isVoid(editor, node) &&
        !Array.from(SlateNode.children(editor, path)).some(
          ([child]) => SlateElement.isElement(child) && SlateEditor.isBlock(editor, child)
        ),
    })
  );
  return blocks
    .map(([, path]) => {
      const range = SlateEditor.range(editor, path);
      const clipped = Range.intersection(range, { anchor: start, focus: end });
      return clipped ? SlateEditor.string(editor, clipped) : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function audioAttributes(text: string) {
  return { isFromGenerate: true, audioText: text };
}

function buildAudio(src: string, text: string): AudioElement {
  return {
    type: "audio",
    src,
    title: ttsAudioTitle(text),
    ...audioAttributes(text),
    children: [{ type: "formatted", text: "" }],
  } as AudioElement;
}

function withNewBatch(editor: SlateEditor, fn: () => void) {
  if (HistoryEditor.isHistoryEditor(editor)) HistoryEditor.withNewBatch(editor, fn);
  else fn();
}

async function upload(editor: SlateEditor, blob: Blob): Promise<string> {
  const url = await editor.getService(IResourceService).upload(ttsAudioFile(blob));
  if (!url) throw new Error("音频保存失败");
  return url;
}

/** 写入失败统一给提示；成功返回 true */
function finish(editor: SlateEditor, committed: boolean): boolean {
  if (!committed) notifierOf(editor).warning(CANNOT_INSERT_HINT);
  return committed;
}

function insertTarget(editor: SlateEditor, intent: TtsInsertIntent): TtsInsertTarget | null {
  const anchor = captureInsertionSubmission(editor);
  if (anchor.check()) {
    anchor.dispose();
    return null;
  }
  return {
    id: crypto.randomUUID(),
    intent,
    signal: anchor.signal,
    commit: async ({ blob, text }) => {
      const url = await upload(editor, blob);
      const outcome = anchor.commit(({ range }) => {
        withNewBatch(editor, () => {
          Transforms.select(editor, range);
          const path = setOrInsertNode(editor, buildAudio(url, text));
          if (path) placeCaretAfter(editor, path);
        });
      });
      return finish(editor, outcome.status === "committed");
    },
    dispose: () => anchor.dispose(),
  };
}

/** 选区最后一个顶层块；块所在位置随后被 pathRef 跟踪 */
function afterSelectionTarget(
  editor: SlateEditor,
  intent: Extract<TtsInsertIntent, { kind: "after-selection" }>
): TtsInsertTarget | null {
  const selection = editor.selection;
  if (!selection) return null;
  const endPath = Range.end(selection).path;
  const topPath = endPath.slice(0, 1);
  if (!SlateNode.has(editor, topPath)) return null;
  const element = SlateNode.get(editor, topPath);
  if (!SlateElement.isElement(element)) return null;
  const submission = captureElementSubmission(editor, {
    element,
    path: topPath,
    // 生成期间用户可能继续改这段，只要块还在就插到它后面
    accept: () => true,
  });
  if (submission.check()) {
    submission.dispose();
    return null;
  }
  return {
    id: crypto.randomUUID(),
    intent,
    signal: submission.signal,
    commit: async ({ blob, text }) => {
      const url = await upload(editor, blob);
      const outcome = submission.commit(({ path }) => {
        withNewBatch(editor, () => {
          const at = Path.next(path);
          Transforms.insertNodes(editor, buildAudio(url, text), { at });
          placeCaretAfter(editor, at);
        });
      });
      return finish(editor, outcome.status === "committed");
    },
    dispose: () => submission.dispose(),
  };
}

function replaceTarget(
  editor: SlateEditor,
  intent: Extract<TtsInsertIntent, { kind: "replace" }>
): TtsInsertTarget | null {
  const original = intent.element as unknown as AudioElement;
  const submission: Submission<{ element: ElementNode; path: Path }> = captureElementSubmission(
    editor,
    {
      element: intent.element,
      path: intent.path,
      // 生成期间音频被替换为别的文件则放弃，避免覆盖用户刚换上的内容
      accept: current => (current as unknown as AudioElement).src === original.src,
    }
  );
  if (submission.check()) {
    submission.dispose();
    return null;
  }
  return {
    id: crypto.randomUUID(),
    intent,
    signal: submission.signal,
    commit: async ({ blob, text }) => {
      const url = await upload(editor, blob);
      const outcome = submission.commit(({ path }) => {
        const patch: Partial<AudioElement> = {
          src: url,
          ...audioAttributes(text),
          // 有原标题沿用；从未命名或原是生成音频时按新文本重命名
          title: original.title && !original.isFromGenerate ? original.title : ttsAudioTitle(text),
        };
        Transforms.setNodes<AudioElement>(editor, patch, { at: path });
      });
      return finish(editor, outcome.status === "committed");
    },
    dispose: () => submission.dispose(),
  };
}

/** 光标落到音频块之后的可输入块开头；没有则补一个空段落 */
function placeCaretAfter(editor: SlateEditor, audioPath: Path) {
  const nextPath = Path.next(audioPath);
  const next = SlateNode.has(editor, nextPath) ? SlateNode.get(editor, nextPath) : null;
  if (!next || !SlateElement.isElement(next) || SlateEditor.isVoid(editor, next)) {
    Transforms.insertNodes(editor, createParagraph(), { at: nextPath });
  }
  Transforms.select(editor, SlateEditor.start(editor, nextPath));
}

/** 打开面板时锁定写入位置；当前位置无法写入（只读、非正文段落等）返回 null */
export function captureTtsInsertTarget(
  editor: SlateEditor,
  intent: TtsInsertIntent
): TtsInsertTarget | null {
  switch (intent.kind) {
    case "insert":
      return insertTarget(editor, intent);
    case "after-selection":
      return afterSelectionTarget(editor, intent);
    case "replace":
      return replaceTarget(editor, intent);
  }
}

export function ttsIntentText(intent: TtsInsertIntent): string {
  return intent.kind === "insert" ? "" : intent.text;
}
