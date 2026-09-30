import { useState, useEffect } from "react";
import type { Descendant } from "slate";
import { CreditCard, Trash2 } from "lucide-react";
import { Button, Checkbox, Dialog, DialogBody, Input, Radio, Tag, Textarea } from "@tau/ui";
import RichTextEditor from "@/components/FlashcardEditor/components/RichTextEditor";
import type { GeneratedFlashcard } from "../hooks/useFlashcardGeneration";
import { FLASHCARD_TYPE_META, textToDescendants } from "@/utils/flashcard";
import type { FlashcardDifficulty, FlashcardData, FlashcardType } from "@/types/flashcard";

interface GeneratedFlashcardEditModalProps {
  open: boolean;
  card: GeneratedFlashcard | null;
  onSave: (updates: Partial<Omit<GeneratedFlashcard, "id" | "selected">>) => void;
  onCancel: () => void;
  isDark?: boolean;
}

/** 表单字段标签，口径与 ui/patterns 的 FormField 一致 */
const FIELD_LABEL = "text-ink-1 text-tau-meta font-medium";

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
  const [initializedCardId, setInitializedCardId] = useState<string | null>(null);

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
    value: string | boolean
  ) => {
    const options = cardData.options ?? [];
    const updated = options.map((opt: any) => {
      if (opt.id !== optionId) {
        if (type === "single-choice" && field === "isCorrect" && value === true) {
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
      options: [...(cardData.options ?? []), { id: randomId(), label: "", isCorrect: false }],
    });
  };

  const removeOption = (optionId: string) => {
    setCardData({
      ...cardData,
      options: (cardData.options ?? []).filter((opt: any) => opt.id !== optionId),
    });
  };

  const handleSave = () => {
    onSave({ prompt, detail, type, difficulty, tags, data: cardData });
  };

  const renderTypeFields = () => {
    if (type === "single-choice" || type === "multiple-choice") {
      const options = cardData.options ?? [];
      const isSingle = type === "single-choice";
      return (
        <div className="space-y-3">
          {options.map((option: any, index: number) => (
            <div key={option.id} className="flex items-center gap-2.5">
              {isSingle ? (
                <Radio
                  value={option.id}
                  name="correct-option"
                  checked={option.isCorrect}
                  onChange={e => handleOptionChange(option.id, "isCorrect", e.target.checked)}
                />
              ) : (
                <Checkbox
                  checked={option.isCorrect}
                  onChange={() => handleOptionChange(option.id, "isCorrect", !option.isCorrect)}
                />
              )}
              <Input
                value={option.label}
                onChange={e => handleOptionChange(option.id, "label", e.target.value)}
                placeholder={`选项 ${index + 1}`}
                className="min-w-0 flex-1"
              />
              <button
                type="button"
                aria-label="删除选项"
                onClick={() => removeOption(option.id)}
                disabled={options.length <= 2}
                className="text-ink-3/50 hover:text-danger hover:bg-danger-soft rounded-tau-sm grid size-6 shrink-0 place-items-center transition-colors disabled:pointer-events-none disabled:opacity-0"
              >
                <Trash2 className="size-[13px]" strokeWidth={1.75} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className="border-line-2 text-ink-3 hover:bg-hover hover:text-ink-2 rounded-tau-md text-tau-body w-full border border-dashed py-2.5 transition-colors"
          >
            + 添加选项
          </button>
        </div>
      );
    }

    if (type === "qa") {
      return (
        <Textarea
          value={cardData.answer ?? ""}
          onChange={e => setCardData({ ...cardData, answer: e.target.value })}
          placeholder="标准答案或要点"
          rows={4}
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
          ].map(option => (
            <button
              key={option.value ? "true" : "false"}
              type="button"
              onClick={() => setCardData({ ...cardData, booleanAnswer: option.value })}
              className={`rounded-tau-md text-tau-body ease-tau-out border-[1.5px] px-4 py-2.5 font-medium transition-colors ${
                current === option.value
                  ? "border-accent bg-accent-soft text-accent-text"
                  : "border-line-1 text-ink-2 hover:border-ink-3/50"
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
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onCancel();
      }}
      title="编辑闪卡"
      icon={<CreditCard />}
      subtitle="修改 AI 生成的闪卡内容"
      width={800}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" onClick={handleSave}>
            保存
          </Button>
        </>
      }
    >
      <DialogBody>
        <>
          <div className="space-y-4">
            {/* Prompt */}
            <div className="flex flex-col gap-1.5">
              <label className={FIELD_LABEL}>题干</label>
              {isEditorReady ? (
                <RichTextEditor
                  key={`prompt-${editorKey}`}
                  value={prompt}
                  onChange={value =>
                    setPrompt(
                      !value || value.length === 0
                        ? [
                            {
                              type: "paragraph",
                              children: [{ type: "formatted", text: "" }],
                            },
                          ]
                        : value
                    )
                  }
                  allowBlanks={type === "cloze"}
                  isDark={isDark}
                  placeholder="闪卡问题或提示"
                  minHeight="100px"
                />
              ) : (
                <div
                  className="bg-surface border-line-1 rounded-tau-sm animate-pulse border"
                  style={{ minHeight: "100px" }}
                />
              )}
            </div>

            {/* Detail */}
            <div className="flex flex-col gap-1.5">
              <label className={FIELD_LABEL}>详细说明 / 提示</label>
              {isEditorReady ? (
                <RichTextEditor
                  key={`detail-${editorKey}`}
                  value={detail}
                  onChange={value =>
                    setDetail(
                      !value || value.length === 0
                        ? [
                            {
                              type: "paragraph",
                              children: [{ type: "formatted", text: "" }],
                            },
                          ]
                        : value
                    )
                  }
                  allowBlanks={false}
                  isDark={isDark}
                  placeholder="额外的说明或提示信息"
                  minHeight="80px"
                />
              ) : (
                <div
                  className="bg-surface border-line-1 rounded-tau-sm animate-pulse border"
                  style={{ minHeight: "80px" }}
                />
              )}
            </div>

            {/* Type Selection */}
            <div className="flex flex-col gap-1.5">
              <label className={FIELD_LABEL}>问题类型</label>
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(FLASHCARD_TYPE_META) as FlashcardType[]).map(t => {
                  const meta = FLASHCARD_TYPE_META[t];
                  const active = type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`rounded-tau-md ease-tau-out border-[1.5px] px-3 py-2.5 text-left transition-colors ${
                        active
                          ? "border-accent bg-accent-soft"
                          : "border-line-1 hover:border-ink-3/50"
                      }`}
                    >
                      <div className="text-ink-1 text-tau-body font-[600]">{meta.label}</div>
                      <p className="text-ink-3 text-tau-sm mt-0.5 line-clamp-2">
                        {meta.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Type-specific fields */}
            {type !== "cloze" && (
              <div className="flex flex-col gap-1.5">
                <label className={FIELD_LABEL}>
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
              <label className={FIELD_LABEL}>难度</label>
              <div className="grid grid-cols-3 gap-3">
                {difficultyOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDifficulty(opt.value)}
                    className={`rounded-tau-md text-tau-body ease-tau-out border-[1.5px] px-4 py-2.5 font-medium transition-colors ${
                      difficulty === opt.value
                        ? "border-accent bg-accent-soft text-accent-text"
                        : "border-line-1 text-ink-2 hover:border-ink-3/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-col gap-1.5">
              <label className={FIELD_LABEL}>标签</label>
              {tags.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <Tag key={tag} onRemove={() => setTags(tags.filter(t => t !== tag))}>
                      {tag}
                    </Tag>
                  ))}
                </div>
              )}
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    if (!tags.includes(tagInput.trim())) {
                      setTags([...tags, tagInput.trim()]);
                    }
                    setTagInput("");
                  }
                }}
                placeholder="输入标签后按回车添加"
              />
            </div>
          </div>
        </>
      </DialogBody>
    </Dialog>
  );
};

export default GeneratedFlashcardEditModal;
