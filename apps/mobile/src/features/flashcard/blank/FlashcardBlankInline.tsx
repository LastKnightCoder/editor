// flashcard-blank 行内节点的编辑态渲染：填空胶囊 + ✎ 配置入口（BottomSheet，
// 内置返回手势拦截）。配置写回 Slate 节点按 blankId 全树定位，不依赖选区。

import { useEffect, useState } from "react";
import { InlineChromiumBugfix } from "@tau/editor";
import type { RenderElementProps } from "slate-react";
import { useSlateStatic } from "slate-react";
import { Editor, Transforms } from "slate";
import { BottomSheet } from "../../../components/BottomSheet";
import { isBlankElement, type FlashcardBlankElement } from "./flashcardBlankTransforms";

const inputClass =
  "w-full rounded-[14px] bg-input px-3.5 py-2.5 text-[14px] font-semibold text-ink placeholder:font-medium placeholder:text-ink-3 outline-none focus:bg-surface";

export function FlashcardBlankInline({
  attributes,
  children,
  element,
}: {
  attributes: RenderElementProps["attributes"];
  children: React.ReactNode;
  element: FlashcardBlankElement;
}) {
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <span
      {...attributes}
      style={{
        background: "var(--brand-soft)",
        color: "var(--brand)",
        border: "1.5px dashed var(--brand)",
        borderRadius: 8,
        padding: "1px 8px",
        margin: "0 2px",
        fontWeight: 700,
        lineHeight: "inherit",
        verticalAlign: "baseline",
      }}
    >
      <InlineChromiumBugfix />
      {children}
      <InlineChromiumBugfix />
      <span
        contentEditable={false}
        onClick={() => setConfigOpen(true)}
        style={{ marginLeft: 5, fontSize: 11, opacity: 0.65, userSelect: "none" }}
        title="配置填空"
      >
        ✎
      </span>
      {element.placeholder ? (
        <span
          contentEditable={false}
          style={{
            marginLeft: 4,
            fontSize: 10,
            opacity: 0.6,
            fontStyle: "italic",
            fontWeight: 400,
          }}
        >
          {element.placeholder}
        </span>
      ) : null}
      <BlankConfigSheet element={element} open={configOpen} onClose={() => setConfigOpen(false)} />
    </span>
  );
}

/** 填空配置：答案/备选答案/提示文本，写回 Slate 节点（答案必填，按钮禁用态兜底） */
function BlankConfigSheet({
  element,
  open,
  onClose,
}: {
  element: FlashcardBlankElement;
  open: boolean;
  onClose: () => void;
}) {
  const editor = useSlateStatic();
  const [placeholder, setPlaceholder] = useState(element.placeholder);
  const [answer, setAnswer] = useState(element.answer);
  const [alternatives, setAlternatives] = useState<string[]>(element.alternativeAnswers ?? []);

  // 每次打开重置为节点当前值，取消后再开不残留上次草稿
  useEffect(() => {
    if (open) {
      setPlaceholder(element.placeholder);
      setAnswer(element.answer);
      setAlternatives(element.alternativeAnswers ?? []);
    }
  }, [open, element]);

  const save = () => {
    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer) return;
    const [entry] = Editor.nodes(editor, {
      at: [],
      match: node => isBlankElement(node) && node.blankId === element.blankId,
    });
    if (!entry) {
      onClose();
      return;
    }
    Transforms.setNodes(
      editor,
      {
        placeholder: placeholder.trim(),
        answer: trimmedAnswer,
        alternativeAnswers: alternatives.map(item => item.trim()).filter(Boolean),
      } as Partial<FlashcardBlankElement>,
      { at: entry[1] }
    );
    onClose();
  };

  return (
    <BottomSheet open={open} title="配置填空" onClose={onClose}>
      <div className="flex flex-col gap-3.5 pb-2">
        <div>
          <div className="text-meta-ink mb-1.5 text-[12px] font-extrabold">正确答案</div>
          <input
            value={answer}
            onChange={event => setAnswer(event.target.value)}
            placeholder="复习时需输入的答案"
            className={inputClass}
          />
        </div>
        <div>
          <div className="text-meta-ink mb-1.5 text-[12px] font-extrabold">备选答案（选填）</div>
          <div className="flex flex-col gap-2">
            {alternatives.map((alternative, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={alternative}
                  onChange={event =>
                    setAlternatives(prev =>
                      prev.map((item, i) => (i === index ? event.target.value : item))
                    )
                  }
                  placeholder={`备选答案 ${index + 1}（判为同义）`}
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="button"
                  aria-label="删除备选答案"
                  onClick={() => setAlternatives(prev => prev.filter((_, i) => i !== index))}
                  className="text-ink-3 active:text-danger flex-none text-[15px] font-bold"
                >
                  ✕
                </button>
              </div>
            ))}
            {alternatives.length < 4 ? (
              <button
                type="button"
                onClick={() => setAlternatives(prev => [...prev, ""])}
                className="border-line text-ink-2 active:bg-press rounded-[14px] border-2 border-dashed py-2 text-[12.5px] font-extrabold"
              >
                ＋ 添加备选答案
              </button>
            ) : null}
          </div>
        </div>
        <div>
          <div className="text-meta-ink mb-1.5 text-[12px] font-extrabold">提示文本（选填）</div>
          <input
            value={placeholder}
            onChange={event => setPlaceholder(event.target.value)}
            placeholder="如：国家名、人物、年份"
            className={inputClass}
          />
          <div className="text-ink-3 mt-1.5 text-[11px] font-semibold">
            答题时显示在填空框内作提示
          </div>
        </div>
        <button
          type="button"
          disabled={!answer.trim()}
          onClick={save}
          className="bg-accent rounded-[16px] py-3 text-[14.5px] font-extrabold text-white active:opacity-80 disabled:opacity-45"
        >
          保存
        </button>
      </div>
    </BottomSheet>
  );
}
