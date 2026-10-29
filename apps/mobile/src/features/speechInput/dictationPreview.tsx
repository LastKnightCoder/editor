import { Path, Range, Text, type Editor, type Point } from "slate";
import { defineExtension, type MarkRenderProps } from "@tau/editor/api";

/** 识别预览：插入点 + 已定稿文字 + 仍在修正的尾句；cancel 表示手指已到 ✕ 上 */
export type DictationPreviewState = {
  point: Point;
  stable: string;
  tail: string;
  cancel: boolean;
  /** 文末追加时预览另起一段显示 */
  asBlock?: boolean;
};

type Listener = () => void;

/** 每个编辑器一份预览状态，只存在内存里，不进文档 */
const states = new WeakMap<Editor, DictationPreviewState | null>();
const listeners = new WeakMap<Editor, Set<Listener>>();

function notify(editor: Editor) {
  listeners.get(editor)?.forEach(listener => listener());
}

export function setDictationPreview(editor: Editor, state: DictationPreviewState | null) {
  states.set(editor, state);
  notify(editor);
}

export function getDictationPreview(editor: Editor) {
  return states.get(editor) ?? null;
}

/** 流式文本按「末尾若干字仍可能被修正」拆成定稿与尾句 */
export function splitPreviewText(text: string, tailLength = 6) {
  const cut = Math.max(0, text.length - tailLength);
  return { stable: text.slice(0, cut), tail: text.slice(cut) };
}

type PreviewLeaf = Text & { dictationPreview?: DictationPreviewState };

function DictationPreviewMark({ leaf, children }: MarkRenderProps) {
  const preview = (leaf as PreviewLeaf).dictationPreview;
  if (!preview) return <>{children}</>;
  return (
    <>
      {children}
      <span
        contentEditable={false}
        data-dictation-preview=""
        className={[
          "dictation-preview",
          preview.cancel && "is-cancel",
          preview.asBlock && "is-block",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {preview.stable}
        <span className="dictation-preview-tail">{preview.tail}</span>
      </span>
    </>
  );
}

/** 在锁定插入点所在的文本节点上放一个折叠装饰，叶子渲染时把预览文字接在插入点之后 */
export const dictationPreviewExtension = defineExtension({
  id: "host.dictation-preview",
  marks: [
    {
      id: "host.dictation-preview.mark",
      keys: ["dictationPreview"],
      render: DictationPreviewMark,
    },
  ],
  decorations: [
    {
      id: "host.dictation-preview",
      decorate: (editor, [node, path]) => {
        const preview = states.get(editor);
        if (!preview || !Text.isText(node) || !Path.equals(path, preview.point.path)) return [];
        return [
          {
            anchor: preview.point,
            focus: preview.point,
            dictationPreview: preview,
          } as Range,
        ];
      },
      subscribe: (editor, invalidate) => {
        let set = listeners.get(editor);
        if (!set) listeners.set(editor, (set = new Set()));
        set.add(invalidate);
        return () => set.delete(invalidate);
      },
    },
  ],
});
