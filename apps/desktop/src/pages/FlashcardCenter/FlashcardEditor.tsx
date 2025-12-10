import { useEffect, useMemo, useState } from "react";
import type { Descendant } from "slate";
import type {
  Flashcard,
  FlashcardReferenceInput,
  FlashcardType,
} from "@/types";
import useFlashcardStore from "@/stores/useFlashcardStore";
import {
  FLASHCARD_TYPE_META,
  createEmptyFlashcardData,
  textToDescendants,
  isEmptyContent,
} from "@/utils/flashcard";
import CustomModal from "@/components/CustomModal";
import CustomCheckbox from "@/components/CustomCheckbox";
import RichTextEditor from "./components/RichTextEditor";
import ReferenceEditor from "./components/ReferenceEditor";
import { CreditCard } from "lucide-react";
import "./FlashcardEditor.css";

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
  const editingCard = useFlashcardStore((state) => state.editingCard);
  const setEditingCard = useFlashcardStore((state) => state.setEditingCard);
  const createCard = useFlashcardStore((state) => state.createCard);
  const updateCard = useFlashcardStore((state) => state.updateCard);

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
        card.references?.map((ref) => ({
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
    setForm((prev) => ({
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
    setForm((prev) => {
      const options = prev.data.options ?? [];
      const updated = options.map((opt: any) => {
        if (opt.id !== optionId) {
          if (
            prev.type === "single-choice" &&
            field === "isCorrect" &&
            value === true
          ) {
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
    setForm((prev) => ({
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

  const addReference = () => {
    setForm((prev) => ({
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
        references: form.references.filter((ref) => ref.title?.trim()),
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
      return (
        <div className="space-y-3">
          {options.map((option: any, index: number) => (
            <div
              key={option.id}
              className="flex items-center gap-3 rounded-xl p-3 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700"
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
                    handleOptionChange(option.id, "isCorrect", !option.isCorrect)
                  }
                />
                <span>正确</span>
              </label>
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className="w-full rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-700 py-3 text-sm text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            + 添加选项
          </button>
        </div>
      );
    }

    if (form.type === "qa") {
      return (
        <textarea
          value={form.data.answer ?? ""}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              data: { ...prev.data, answer: e.target.value },
            }))
          }
          placeholder="标准答案或要点"
          rows={4}
          className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)] resize-none"
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
          ].map((option) => (
            <button
              key={option.value ? "true" : "false"}
              type="button"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  data: { ...prev.data, booleanAnswer: option.value },
                }))
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

  const referenceList = useMemo(() => form.references ?? [], [form.references]);

  return (
    <CustomModal
      open={open}
      onCancel={handleClose}
      width="800px"
      centered
      footer={null}
      title={mode === "create" ? "新建闪卡" : "编辑闪卡"}
      subtitle="管理闪卡内容和详情"
      icon={<CreditCard className="w-5 h-5" />}
      iconBgColor="bg-indigo-50 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30"
      bodyClassName="flashcard-editor-scroll"
    >
      <>
        {deckMissing && (
          <div className="px-3.5 py-2.5 mb-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              请先创建并选择一个卡组后再添加闪卡。
            </p>
          </div>
        )}

        <div className="space-y-4 border-r-20 border-transparent">
          {/* Prompt */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              题干
            </label>
            {isEditorReady ? (
              <RichTextEditor
                key={`prompt-${currentKey}`}
                value={form.prompt}
                onChange={(value) =>
                  setForm((prev) => ({
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
                className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700"
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
                key={`detail-${currentKey}`}
                value={form.detail}
                onChange={(value) =>
                  setForm((prev) => ({
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
                className="rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700"
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
                (type) => {
                  const meta = FLASHCARD_TYPE_META[type];
                  const active = form.type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeChange(type)}
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
                }
              )}
            </div>
          </div>

          {/* Type-specific fields */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
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
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              标签
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        tags: prev.tags.filter((item) => item !== tag),
                      }))
                    }
                    className="text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (tagInput.trim() && !form.tags.includes(tagInput.trim())) {
                    setForm((prev) => ({
                      ...prev,
                      tags: [...prev.tags, tagInput.trim()],
                    }));
                    setTagInput("");
                  }
                }
              }}
              placeholder="输入标签后按回车添加"
              className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-white shadow-inner placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(99,102,241,0.15)] dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(99,102,241,0.25)]"
            />
          </div>

          {/* Difficulty */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              难度
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(["foundation", "standard", "advanced"] as const).map(
                (level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({ ...prev, difficulty: level }))
                    }
                    className={`px-4 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
                      form.difficulty === level
                        ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
                        : "border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600"
                    }`}
                  >
                    {level === "foundation"
                      ? "基础"
                      : level === "advanced"
                        ? "进阶"
                        : "常规"}
                  </button>
                )
              )}
            </div>
          </div>

          {/* References */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                参考资料 {referenceList.length > 0 && `(${referenceList.length})`}
              </label>
              <button
                type="button"
                onClick={addReference}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors"
              >
                + 添加参考
              </button>
            </div>
            {referenceList.length > 0 ? (
              <div className="space-y-3">
                {referenceList.map((ref, index) => (
                  <div key={index} className="relative">
                    <div className="absolute -left-2 top-4 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
                      <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                        {index + 1}
                      </span>
                    </div>
                    <div className="ml-6">
                      <ReferenceEditor
                        reference={ref}
                        onChange={(updatedRef) => {
                          setForm((prev) => {
                            const next = [...prev.references];
                            next[index] = updatedRef;
                            return { ...prev, references: next };
                          });
                        }}
                        onRemove={() => {
                          setForm((prev) => ({
                            ...prev,
                            references: prev.references.filter((_, i) => i !== index),
                          }));
                        }}
                        isDark={isDark}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-700 py-8 px-4 text-center">
                <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">
                  暂无参考资料
                </p>
                <p className="text-xs text-gray-400 dark:text-slate-500">
                  点击上方"添加参考"按钮来添加参考资料
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-4 mr-5 mt-4 border-t border-gray-200 dark:border-slate-800">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || deckMissing || isEmptyContent(form.prompt)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "保存中..." : mode === "create" ? "创建闪卡" : "保存修改"}
          </button>
        </div>
      </>
    </CustomModal>
  );
};

export default FlashcardEditor;
