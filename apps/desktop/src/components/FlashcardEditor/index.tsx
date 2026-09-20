import { useEffect, useMemo, useState } from "react";
import type { Descendant } from "slate";
import { CreditCard, Trash2 } from "lucide-react";
import { Button, Checkbox, Dialog, Input, Radio, Tag, Textarea } from "@tau/ui";
import type { Flashcard, FlashcardReferenceInput, FlashcardType } from "@/types";
import useFlashcardStore from "@/stores/useFlashcardStore";
import {
  FLASHCARD_TYPE_META,
  createEmptyFlashcardData,
  textToDescendants,
  isEmptyContent,
} from "@/utils/flashcard";
import RichTextEditor from "./components/RichTextEditor";
import ReferenceEditor from "./components/ReferenceEditor";

interface FlashcardEditorProps {
  open: boolean;
  mode: "create" | "edit";
  activeDeckId: number | null;
  onClose: () => void;
  isDark: boolean;
  initialReferences?: FlashcardReferenceInput[];
}

type FormState = {
  prompt: Descendant[];
  detail: Descendant[];
  type: FlashcardType;
  difficulty: "foundation" | "standard" | "advanced";
  tags: string[];
  references: FlashcardReferenceInput[];
  data: any;
};

/** 表单字段标签，口径与 ui/patterns 的 FormField 一致 */
const FIELD_LABEL = "text-ink-1 text-tau-meta font-medium";

const randomId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

const FlashcardEditor = ({
  open,
  mode,
  activeDeckId,
  onClose,
  isDark,
  initialReferences,
}: FlashcardEditorProps) => {
  const editingCard = useFlashcardStore(state => state.editingCard);
  const setEditingCard = useFlashcardStore(state => state.setEditingCard);
  const createCard = useFlashcardStore(state => state.createCard);
  const updateCard = useFlashcardStore(state => state.updateCard);

  const [form, setForm] = useState<FormState>({
    prompt: textToDescendants(""),
    detail: textToDescendants(""),
    type: "qa",
    difficulty: "standard",
    tags: [],
    references: [],
    data: createEmptyFlashcardData("qa"),
  });
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  // 跟踪当前已初始化的状态，用于判断是否需要等待 state 同步
  // 格式: "create" 或 "edit-{cardId}"
  const [initializedKey, setInitializedKey] = useState<string | null>(null);

  const deckMissing = mode === "create" && activeDeckId == null;

  // 计算当前应该的 key
  const currentKey = mode === "create" ? "create" : `edit-${editingCard?.id ?? "none"}`;

  const initializeForm = (card?: Flashcard | null) => {
    if (!card) {
      setForm({
        prompt: textToDescendants(""),
        detail: textToDescendants(""),
        type: "qa",
        difficulty: "standard",
        tags: [],
        references: initialReferences || [],
        data: createEmptyFlashcardData("qa"),
      });
      setInitializedKey("create");
      return;
    }
    setForm({
      prompt: card.prompt,
      detail: card.detail,
      type: card.type,
      difficulty: card.difficulty,
      tags: card.tags ?? [],
      references:
        card.references?.map(ref => ({
          refType: ref.refType,
          title: ref.title,
          contentId: ref.refType === "content" ? ref.contentId : undefined,
          customContent: ref.refType === "custom" ? ref.content?.content : undefined,
        })) ?? [],
      data: card.data ?? createEmptyFlashcardData(card.type),
    });
    setInitializedKey(`edit-${card.id}`);
  };

  useEffect(() => {
    if (open) {
      initializeForm(mode === "edit" ? (editingCard ?? null) : null);
      setTagInput("");
    }
  }, [open, mode, editingCard]);

  // 当 modal 关闭时，重置初始化状态
  useEffect(() => {
    if (!open) {
      setInitializedKey(null);
    }
  }, [open]);

  // 只有当 state 已经初始化后，才渲染编辑器
  const isEditorReady = initializedKey === currentKey;

  const handleClose = () => {
    setEditingCard(null);
    setTagInput("");
    onClose();
  };

  const handleTypeChange = (type: FlashcardType) => {
    setForm(prev => ({
      ...prev,
      type,
      data: prev.type === type ? prev.data : createEmptyFlashcardData(type),
    }));
  };

  const handleOptionChange = (
    optionId: string,
    field: "label" | "isCorrect",
    value: string | boolean
  ) => {
    setForm(prev => {
      const options = prev.data.options ?? [];
      const updated = options.map((opt: any) => {
        if (opt.id !== optionId) {
          if (prev.type === "single-choice" && field === "isCorrect" && value === true) {
            return { ...opt, isCorrect: false };
          }
          return opt;
        }
        return { ...opt, [field]: value };
      });
      return {
        ...prev,
        data: {
          ...prev.data,
          options: updated,
        },
      };
    });
  };

  const addOption = () => {
    setForm(prev => ({
      ...prev,
      data: {
        ...prev.data,
        options: [
          ...(prev.data.options ?? []),
          {
            id: randomId(),
            label: "",
            isCorrect: false,
          },
        ],
      },
    }));
  };

  const removeOption = (optionId: string) => {
    setForm(prev => ({
      ...prev,
      data: {
        ...prev.data,
        options: (prev.data.options ?? []).filter((opt: any) => opt.id !== optionId),
      },
    }));
  };

  const addReference = () => {
    setForm(prev => ({
      ...prev,
      references: [
        ...prev.references,
        {
          refType: "content",
          title: "",
          contentId: undefined,
          customContent: undefined,
        },
      ],
    }));
  };

  const handleSubmit = async () => {
    if (isEmptyContent(form.prompt) || deckMissing) {
      return;
    }
    setSaving(true);
    try {
      const payload = {
        type: form.type,
        prompt: form.prompt,
        detail: form.detail,
        difficulty: form.difficulty,
        tags: form.tags,
        data: form.data,
        references: form.references.filter(ref => ref.title?.trim()),
      };
      if (mode === "create" && activeDeckId) {
        await createCard({
          ...payload,
          deckId: activeDeckId,
        });
      } else if (mode === "edit" && editingCard) {
        await updateCard({
          ...payload,
          id: editingCard.id,
          deckId: editingCard.deckId,
        });
      }
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  const renderTypeFields = () => {
    if (form.type === "single-choice" || form.type === "multiple-choice") {
      const options = form.data.options ?? [];
      const isSingle = form.type === "single-choice";
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

    if (form.type === "qa") {
      return (
        <Textarea
          value={form.data.answer ?? ""}
          onChange={e =>
            setForm(prev => ({
              ...prev,
              data: { ...prev.data, answer: e.target.value },
            }))
          }
          placeholder="标准答案或要点"
          rows={4}
        />
      );
    }

    if (form.type === "boolean") {
      const current = form.data.booleanAnswer ?? true;
      return (
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: true, label: "正确 ✓" },
            { value: false, label: "错误 ✗" },
          ].map(option => (
            <button
              key={option.value ? "true" : "false"}
              type="button"
              onClick={() =>
                setForm(prev => ({
                  ...prev,
                  data: { ...prev.data, booleanAnswer: option.value },
                }))
              }
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

  const referenceList = useMemo(() => form.references ?? [], [form.references]);

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) handleClose();
      }}
      title={mode === "create" ? "新建闪卡" : "编辑闪卡"}
      icon={<CreditCard />}
      subtitle="管理闪卡内容和详情"
      width={800}
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={saving}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={deckMissing || isEmptyContent(form.prompt)}
            loading={saving}
            loadingText="保存中..."
          >
            {mode === "create" ? "创建闪卡" : "保存修改"}
          </Button>
        </>
      }
    >
      <>
        {deckMissing && (
          <div className="bg-warn-soft text-warn rounded-tau-md text-tau-body mb-4 px-3.5 py-2.5">
            请先创建并选择一个卡组后再添加闪卡。
          </div>
        )}

        <div className="space-y-4">
          {/* Prompt */}
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL}>题干</label>
            {isEditorReady ? (
              <RichTextEditor
                key={`prompt-${currentKey}`}
                value={form.prompt}
                onChange={value =>
                  setForm(prev => ({
                    ...prev,
                    prompt:
                      !value || value.length === 0
                        ? [
                            {
                              type: "paragraph",
                              children: [{ type: "formatted", text: "" }],
                            },
                          ]
                        : value,
                  }))
                }
                allowBlanks={form.type === "cloze"}
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
                key={`detail-${currentKey}`}
                value={form.detail}
                onChange={value =>
                  setForm(prev => ({
                    ...prev,
                    detail:
                      !value || value.length === 0
                        ? [
                            {
                              type: "paragraph",
                              children: [{ type: "formatted", text: "" }],
                            },
                          ]
                        : value,
                  }))
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
              {(Object.keys(FLASHCARD_TYPE_META) as FlashcardType[]).map(type => {
                const meta = FLASHCARD_TYPE_META[type];
                const active = form.type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleTypeChange(type)}
                    className={`rounded-tau-md ease-tau-out border-[1.5px] px-3 py-2.5 text-left transition-colors ${
                      active
                        ? "border-accent bg-accent-soft"
                        : "border-line-1 hover:border-ink-3/50"
                    }`}
                  >
                    <div className="text-ink-1 text-tau-body font-[600]">{meta.label}</div>
                    <p className="text-ink-3 text-tau-sm mt-0.5 line-clamp-2">{meta.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Type-specific fields */}
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL}>
              {form.type === "single-choice" || form.type === "multiple-choice"
                ? "选项"
                : form.type === "cloze"
                  ? "填空内容"
                  : form.type === "qa"
                    ? "参考答案"
                    : "正确答案"}
            </label>
            {renderTypeFields()}
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL}>标签</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {form.tags.map(tag => (
                <Tag
                  key={tag}
                  onRemove={() =>
                    setForm(prev => ({
                      ...prev,
                      tags: prev.tags.filter(item => item !== tag),
                    }))
                  }
                >
                  {tag}
                </Tag>
              ))}
            </div>
            <Input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (tagInput.trim() && !form.tags.includes(tagInput.trim())) {
                    setForm(prev => ({
                      ...prev,
                      tags: [...prev.tags, tagInput.trim()],
                    }));
                    setTagInput("");
                  }
                }
              }}
              placeholder="输入标签后按回车添加"
            />
          </div>

          {/* Difficulty */}
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL}>难度</label>
            <div className="grid grid-cols-3 gap-3">
              {(["foundation", "standard", "advanced"] as const).map(level => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, difficulty: level }))}
                  className={`rounded-tau-md text-tau-body ease-tau-out border-[1.5px] px-4 py-2.5 font-medium transition-colors ${
                    form.difficulty === level
                      ? "border-accent bg-accent-soft text-accent-text"
                      : "border-line-1 text-ink-2 hover:border-ink-3/50"
                  }`}
                >
                  {level === "foundation" ? "基础" : level === "advanced" ? "进阶" : "常规"}
                </button>
              ))}
            </div>
          </div>

          {/* References */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className={FIELD_LABEL}>
                参考资料 {referenceList.length > 0 && `(${referenceList.length})`}
              </label>
              <button
                type="button"
                onClick={addReference}
                className="text-accent hover:text-accent-hover text-tau-sm font-medium transition-colors"
              >
                + 添加参考
              </button>
            </div>
            {referenceList.length > 0 ? (
              <div className="space-y-5">
                {referenceList.map((ref, index) => (
                  <ReferenceEditor
                    key={index}
                    reference={ref}
                    onChange={updatedRef => {
                      setForm(prev => {
                        const next = [...prev.references];
                        next[index] = updatedRef;
                        return { ...prev, references: next };
                      });
                    }}
                    onRemove={() => {
                      setForm(prev => ({
                        ...prev,
                        references: prev.references.filter((_, i) => i !== index),
                      }));
                    }}
                    isDark={isDark}
                  />
                ))}
              </div>
            ) : (
              <div className="border-line-2 text-ink-3 rounded-tau-md text-tau-body border border-dashed px-4 py-6 text-center">
                暂无参考资料
              </div>
            )}
          </div>
        </div>
      </>
    </Dialog>
  );
};

export default FlashcardEditor;
