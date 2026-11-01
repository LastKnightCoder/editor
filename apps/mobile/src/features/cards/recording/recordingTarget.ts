import { captureElementSubmission, createParagraph, type Submission } from "@tau/editor/api";
import type { AudioElement } from "@tau/editor/extensions/media";
import {
  Editor as SlateEditor,
  Element as SlateElement,
  Node as SlateNode,
  Path,
  Transforms,
  type Element as ElementNode,
  type PathRef,
} from "slate";
import { HistoryEditor } from "slate-history";

/** 找回定位文字取顶层块开头的长度 */
const ANCHOR_TEXT_LENGTH = 40;

/**
 * 录音落点：开始时记下的顶层块，录音中随文档编辑移动。
 * 光标所在段为空时插在它之前（用户在空段里接着写），否则插在它之后。
 */
export type RecordingAnchor = {
  ref: PathRef;
  before: boolean;
  /** 找回时定位：落点前一个有文字的顶层块的开头 */
  afterText?: string;
};

/** 重新录制：原地换掉这个音频块的 src */
export type RecordingReplace = {
  element: ElementNode;
  path: Path;
};

function isEmptyParagraph(node: SlateNode): boolean {
  return (
    SlateElement.isElement(node) &&
    node.type === "paragraph" &&
    SlateNode.string(node).trim() === "" &&
    node.children.every(child => !SlateElement.isElement(child))
  );
}

/** 从 index 往前找第一个有文字的顶层块，取其开头作为找回定位 */
function anchorTextBefore(editor: SlateEditor, index: number): string | undefined {
  for (let i = index; i >= 0; i--) {
    const text = SlateNode.string(editor.children[i] as SlateNode).trim();
    if (text) return text.slice(0, ANCHOR_TEXT_LENGTH);
  }
  return undefined;
}

export function captureRecordingAnchor(editor: SlateEditor): RecordingAnchor {
  const selection = editor.selection;
  const lastIndex = editor.children.length - 1;
  const index = selection ? Math.min(selection.anchor.path[0] ?? lastIndex, lastIndex) : lastIndex;
  const block = editor.children[index] as SlateNode;
  const before = selection !== null && isEmptyParagraph(block);
  return {
    ref: SlateEditor.pathRef(editor, [index]),
    before,
    afterText: anchorTextBefore(editor, before ? index - 1 : index),
  };
}

/** 落点当前对应的插入位置；落点块被删时为 null（调用方插到文末） */
export function anchorInsertPath(anchor: RecordingAnchor): Path | null {
  const current = anchor.ref.current;
  if (!current) return null;
  return anchor.before ? current : Path.next(current);
}

export function defaultRecordingTitle(startedAt: number): string {
  const date = new Date(startedAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `录音 ${date.getMonth() + 1} 月 ${date.getDate()} 日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const DEFAULT_TITLE = /^录音 \d{1,2} 月 \d{1,2} 日 \d{2}:\d{2}$/;

function buildAudio(src: string, title: string): AudioElement {
  return {
    type: "audio",
    src,
    title,
    uuid: crypto.randomUUID(),
    children: [{ type: "formatted", text: "" }],
  } as AudioElement;
}

function withNewBatch(editor: SlateEditor, fn: () => void) {
  if (HistoryEditor.isHistoryEditor(editor)) HistoryEditor.withNewBatch(editor, fn);
  else fn();
}

/** 插在落点（落点失效时插到文末）；给定 at 时 insertNodes 不移动光标，一个撤销步 */
export function insertRecordingAt(
  editor: SlateEditor,
  at: Path | null,
  src: string,
  title: string
): Path {
  const end = editor.children.length;
  const path = at && at.length === 1 && at[0] <= end ? at : [end];
  withNewBatch(editor, () => {
    Transforms.insertNodes(editor, buildAudio(src, title), { at: path, select: false });
    // 文末是 void 块时补空段落，保证块后还能继续写
    if (path[0] === editor.children.length - 1) {
      Transforms.insertNodes(editor, createParagraph(), {
        at: [editor.children.length],
        select: false,
      });
    }
  });
  return path;
}

/** 开始录音时锁定的写入目标：新插（落点）或原地重新录制 */
export type RecordingDestination =
  | { kind: "insert"; anchor: RecordingAnchor }
  | {
      kind: "replace";
      original: AudioElement;
      submission: Submission<{ element: ElementNode; path: Path }>;
    };

/** 重新录制：开始时锁定音频块，录音中它随编辑移动；录音期间被换成别的文件则不覆盖 */
export function captureReplaceDestination(
  editor: SlateEditor,
  target: RecordingReplace
): RecordingDestination | null {
  const original = target.element as unknown as AudioElement;
  const submission = captureElementSubmission(editor, {
    element: target.element,
    path: target.path,
    accept: current => (current as unknown as AudioElement).src === original.src,
  });
  if (submission.check()) {
    submission.dispose();
    return null;
  }
  return { kind: "replace", original, submission };
}

export function disposeDestination(destination: RecordingDestination) {
  if (destination.kind === "insert") destination.anchor.ref.unref();
  else destination.submission.dispose();
}

/**
 * 写入录音并返回音频块所在路径。重新录制的目标已失效时退回插到文末，录音不丢。
 * 用户改过的标题保留，默认标题跟着更新为新的录制时间。
 */
export function commitRecording(
  editor: SlateEditor,
  destination: RecordingDestination,
  src: string,
  title: string
): Path {
  if (destination.kind === "insert") {
    return insertRecordingAt(editor, anchorInsertPath(destination.anchor), src, title);
  }
  const { original } = destination;
  let replaced: Path | null = null;
  destination.submission.commit(({ path }) => {
    const keepTitle = original.title && !DEFAULT_TITLE.test(original.title);
    withNewBatch(editor, () => {
      Transforms.setNodes<AudioElement>(
        editor,
        { src, title: keepTitle ? original.title : title },
        { at: path }
      );
      // 录音不是合成音频，去掉合成来源与原文
      Transforms.unsetNodes(editor, ["isFromGenerate", "audioText"], { at: path });
    });
    replaced = path;
  });
  return replaced ?? insertRecordingAt(editor, null, src, title);
}

/** 找回：插在以 afterText 开头的顶层块之后；找不到插到文末 */
export function recoveryInsertPath(editor: SlateEditor, afterText?: string): Path | null {
  if (!afterText) return null;
  const index = editor.children.findIndex(node =>
    SlateNode.string(node as SlateNode)
      .trim()
      .startsWith(afterText)
  );
  return index < 0 ? null : [index + 1];
}
