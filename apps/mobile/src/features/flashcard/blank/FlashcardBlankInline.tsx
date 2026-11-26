// flashcard-blank 行内节点的编辑态渲染：填空胶囊 + ✎ 配置入口（BottomSheet，
// 内置返回手势拦截）。配置写回 Slate 节点按 blankId 全树定位，不依赖选区。

import { flashcardTranslator, useFlashcardI18n } from "../i18n";
import { useEffect, useState } from "react";
import { InlineChromiumBugfix } from "@tau/editor";
import type { RenderElementProps } from "slate-react";
import { useSlateStatic } from "slate-react";
import { Editor, Transforms } from "slate";
import { BottomSheet } from "../../../components/BottomSheet";
import { isBlankElement, type FlashcardBlankElement } from "./flashcardBlankTransforms";

const inputClass = "input-base w-full px-3.5 py-2.5 font-semibold placeholder:font-medium";

export function FlashcardBlankInline({
  attributes,
  children,
  element,
}: {
  attributes: RenderElementProps["attributes"];
  children: React.ReactNode;
  element: FlashcardBlankElement;
}) {
  useFlashcardI18n();
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <span
      {...attributes}
      style={{
        background: "var(--tau-accent-soft)",
        color: "var(--tau-accent)",
        border: "1.5px dashed var(--tau-accent)",
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
        title={flashcardTranslator.t("ui.configureBlank")}
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
  useFlashcardI18n();
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
    <BottomSheet open={open} title={flashcardTranslator.t("ui.configureBlank")} onClose={onClose}>
      <div className="flex flex-col gap-3.5 pb-2">
        <div>
          <div className="text-ink-2 mb-1.5 text-[12px] font-extrabold">
            {flashcardTranslator.t("ui.correctAnswer")}
          </div>
          <input
            value={answer}
            onChange={event => setAnswer(event.target.value)}
            placeholder={flashcardTranslator.t("ui.answerToEnterDuringReview")}
            className={inputClass}
          />
        </div>
        <div>
          <div className="text-ink-2 mb-1.5 text-[12px] font-extrabold">
            {flashcardTranslator.t("ui.alternativeAnswersOptional")}
          </div>
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
                  placeholder={flashcardTranslator.t("blank.alternative", { number: index + 1 })}
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="button"
                  aria-label={flashcardTranslator.t("ui.removeAlternativeAnswer")}
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
                className="border-line-1 text-ink-2 active:bg-hover rounded-[14px] border-2 border-dashed py-2 text-[12.5px] font-extrabold"
              >
                {flashcardTranslator.t("ui.addAlternativeAnswer")}
              </button>
            ) : null}
          </div>
        </div>
        <div>
          <div className="text-ink-2 mb-1.5 text-[12px] font-extrabold">
            {flashcardTranslator.t("ui.placeholderOptional")}
          </div>
          <input
            value={placeholder}
            onChange={event => setPlaceholder(event.target.value)}
            placeholder={flashcardTranslator.t("ui.forExampleCountryPersonOrYear")}
            className={inputClass}
          />
          <div className="text-ink-3 mt-1.5 text-[11px] font-semibold">
            {flashcardTranslator.t("ui.shownAsAHintInsideTheBlankWhileAnswering")}
          </div>
        </div>
        <button
          type="button"
          disabled={!answer.trim()}
          onClick={save}
          className="bg-accent text-ink-inverse rounded-[16px] py-3 text-[14.5px] font-extrabold active:opacity-80 disabled:opacity-45"
        >
          {flashcardTranslator.t("ui.save")}
        </button>
      </div>
    </BottomSheet>
  );
}
