import { useState, useEffect } from "react";
import type { Descendant } from "slate";
import { CreditCard } from "lucide-react";
import CustomModal from "@/components/CustomModal";
import CustomCheckbox from "@/components/CustomCheckbox";
import RichTextEditor from "@/pages/FlashcardCenter/components/RichTextEditor";
import type { GeneratedFlashcard } from "@/hooks/useFlashcardGeneration";
import { FLASHCARD_TYPE_META, textToDescendants } from "@/utils/flashcard";
import type {
  FlashcardDifficulty,
  FlashcardData,
  FlashcardType,
} from "@/types/flashcard";
import "@/pages/FlashcardCenter/FlashcardEditor.css";

interface GeneratedFlashcardEditModalProps {
  open: boolean;
  card: GeneratedFlashcard | null;
  onSave: (
    updates: Partial<Omit<GeneratedFlashcard, "id" | "selected">>,
  ) => void;
  onCancel: () => void;
  isDark?: boolean;
}

const randomId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

const difficultyOptions: { value: FlashcardDifficulty; label: string }[] = [
  { value: "foundation", label: "基础" },
  { value: "standard", label: "常规" },
  { value: "advanced", label: "进阶" },
];

const GeneratedFlashcardEditModal = ({
  open,
  card,
  onSave,
  onCancel,
  isDark = false,
}: GeneratedFlashcardEditModalProps) => {
  const [prompt, setPrompt] = useState<Descendant[]>(textToDescendants(""));
  const [detail, setDetail] = useState<Descendant[]>(textToDescendants(""));
  const [type, setType] = useState<FlashcardType>("qa");
  const [difficulty, setDifficulty] = useState<FlashcardDifficulty>("standard");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [cardData, setCardData] = useState<FlashcardData>({});
  // 跟踪当前已初始化的 card id，用于判断是否需要等待 state 同步
  const [initializedCardId, setInitializedCardId] = useState<string | null>(
    null,
  );

  // 使用 card.id 作为 editorKey，确保不同卡片使用不同的编辑器实例
  const editorKey = card?.id ?? "empty";

  useEffect(() => {
    if (card && open) {
      setPrompt(card.prompt);
      setDetail(card.detail);
      setType(card.type);
      setDifficulty(card.difficulty);
      setTags([...card.tags]);
      setCardData({ ...card.data });
      // 标记当前 card 已初始化，这会在下一次渲染时生效
      setInitializedCardId(card.id);
    }
  }, [card, open]);

  // 当 modal 关闭时，重置初始化状态
  useEffect(() => {
    if (!open) {
      setInitializedCardId(null);
    }
  }, [open]);

  // 只有当 state 已经为当前 card 初始化后，才渲染编辑器
  const isEditorReady = card && initializedCardId === card.id;

  const handleOptionChange = (
    optionId: string,
    field: "label" | "isCorrect",
    value: string | boolean,
  ) => {
    const options = cardData.options ?? [];
    const updated = options.map((opt: any) => {
      if (opt.id !== optionId) {
        if (
          type === "single-choice" &&
          field === "isCorrect" &&
          value === true
        ) {
          return { ...opt, isCorrect: false };
        }
        return opt;
      }
      return { ...opt, [field]: value };
    });
    setCardData({ ...cardData, options: updated });
  };

  const addOption = () => {
    setCardData({
      ...cardData,
      options: [
        ...(cardData.options ?? []),
        { id: randomId(), label: "", isCorrect: false },
      ],
    });
  };

  const handleSave = () => {
    onSave({ prompt, detail, type, difficulty, tags, data: cardData });
  };

  const renderTypeFields = () => {
    if (type === "single-choice" || type === "multiple-choice") {
      const options = cardData.options ?? [];
      return (
        <div className="space-y-3">
          {options.map((option: any, index: number) => (
            <div
              key={option.id}
              className="flex items-center gap-3 rounded-xl p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700"
            >
              <input
                value={option.label}
                onChange={(e) =>
                  handleOptionChange(option.id, "label", e.target.value)
                }
                placeholder={`选项 ${index + 1}`}
                className="flex-1 bg-transparent text-sm outline-none text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500"
              />
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400 cursor-pointer">
                <CustomCheckbox
                  checked={option.isCorrect}
                  onChange={() =>
                    handleOptionChange(
                      option.id,
                      "isCorrect",
                      !option.isCorrect,
                    )
                  }
                />
                <span>正确</span>
              </label>
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className="w-full rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-700 py-3 text-sm text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
          >
            + 添加选项
          </button>
        </div>
      );
    }

    if (type === "qa") {
      return (
        <textarea
          value={cardData.answer ?? ""}
          onChange={(e) => setCardData({ ...cardData, answer: e.target.value })}
          placeholder="标准答案或要点"
          rows={4}
          className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)] resize-none"
        />
      );
    }

    if (type === "boolean") {
      const current = cardData.booleanAnswer ?? true;
      return (
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: true, label: "正确 ✓" },
            { value: false, label: "错误 ✗" },
          ].map((option) => (
            <button
              key={option.value ? "true" : "false"}
              type="button"
              onClick={() =>
                setCardData({ ...cardData, booleanAnswer: option.value })
              }
              className={`px-4 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
                current === option.value
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      );
    }

    return null;
  };

  if (!card) return null;

  return (
    <CustomModal
      open={open}
      onCancel={onCancel}
      width="800px"
      centered
      footer={null}
      title="编辑闪卡"
      subtitle="修改 AI 生成的闪卡内容"
      icon={<CreditCard className="w-5 h-5" />}
      iconBgColor="bg-indigo-50 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30"
      bodyClassName="flashcard-editor-scroll"
    >
      <>
        <div className="space-y-4 border-r-20 border-transparent">
          {/* Prompt */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              题干
            </label>
            {isEditorReady ? (
              <RichTextEditor
                key={`prompt-${editorKey}`}
                value={prompt}
                onChange={(value) =>
                  setPrompt(
                    !value || value.length === 0
                      ? [
                          {
                            type: "paragraph",
                            children: [{ type: "formatted", text: "" }],
                          },
                        ]
                      : value,
                  )
                }
                allowBlanks={type === "cloze"}
                isDark={isDark}
                placeholder="闪卡问题或提示"
                minHeight="100px"
              />
            ) : (
              <div
                className="rounded-xl bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700"
                style={{ minHeight: "100px" }}
              />
            )}
          </div>

          {/* Detail */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              详细说明 / 提示
            </label>
            {isEditorReady ? (
              <RichTextEditor
                key={`detail-${editorKey}`}
                value={detail}
                onChange={(value) =>
                  setDetail(
                    !value || value.length === 0
                      ? [
                          {
                            type: "paragraph",
                            children: [{ type: "formatted", text: "" }],
                          },
                        ]
                      : value,
                  )
                }
                allowBlanks={false}
                isDark={isDark}
                placeholder="额外的说明或提示信息"
                minHeight="80px"
              />
            ) : (
              <div
                className="rounded-xl bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700"
                style={{ minHeight: "80px" }}
              />
            )}
          </div>

          {/* Type Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              问题类型
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(FLASHCARD_TYPE_META) as FlashcardType[]).map(
                (t) => {
                  const meta = FLASHCARD_TYPE_META[t];
                  const active = type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                        active
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                          : "border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600"
                      }`}
                    >
                      <div className="text-sm font-semibold text-gray-800 dark:text-white">
                        {meta.label}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                        {meta.description}
                      </p>
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {/* Type-specific fields */}
          {type !== "cloze" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                {type === "single-choice" || type === "multiple-choice"
                  ? "选项"
                  : type === "qa"
                    ? "参考答案"
                    : "正确答案"}
              </label>
              {renderTypeFields()}
            </div>
          )}

          {/* Difficulty */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              难度
            </label>
            <div className="grid grid-cols-3 gap-3">
              {difficultyOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDifficulty(opt.value)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all border-2 ${
                    difficulty === opt.value
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                      : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              标签
            </label>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    if (!tags.includes(tagInput.trim())) {
                      setTags([...tags, tagInput.trim()]);
                    }
                    setTagInput("");
                  }
                }}
                placeholder="输入标签后按回车添加"
                className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500"
              />
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-full text-xs bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 flex items-center gap-1.5"
                  >
                    {tag}
                    <button
                      onClick={() => setTags(tags.filter((t) => t !== tag))}
                      className="hover:text-red-500 transition-colors"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-5 mt-5 border-t border-gray-200 dark:border-slate-700">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            保存
          </button>
        </div>
      </>
    </CustomModal>
  );
};

export default GeneratedFlashcardEditModal;
