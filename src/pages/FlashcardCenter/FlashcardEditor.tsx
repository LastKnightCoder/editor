import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  Flashcard,
  FlashcardReferenceInput,
  FlashcardType,
} from "@/types";
import useFlashcardStore from "@/stores/useFlashcardStore";
import {
  FLASHCARD_TYPE_META,
  createEmptyFlashcardData,
} from "@/utils/flashcard";

interface FlashcardEditorProps {
  open: boolean;
  mode: "create" | "edit";
  activeDeckId: number | null;
  onClose: () => void;
  isDark: boolean;
}

type FormState = {
  prompt: string;
  detail: string;
  type: FlashcardType;
  difficulty: "foundation" | "standard" | "advanced";
  tags: string[];
  references: FlashcardReferenceInput[];
  data: any;
};

const referenceTypeOptions: FlashcardReferenceInput["refType"][] = [
  "card",
  "article",
  "document",
  "project",
  "resource",
  "url",
  "note",
];

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
}: FlashcardEditorProps) => {
  const editingCard = useFlashcardStore((state) => state.editingCard);
  const setEditingCard = useFlashcardStore((state) => state.setEditingCard);
  const createCard = useFlashcardStore((state) => state.createCard);
  const updateCard = useFlashcardStore((state) => state.updateCard);

  const [form, setForm] = useState<FormState>({
    prompt: "",
    detail: "",
    type: "qa",
    difficulty: "standard",
    tags: [],
    references: [],
    data: createEmptyFlashcardData("qa"),
  });
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  const surfaceClass = isDark
    ? "bg-slate-900/95 border-white/10 text-white"
    : "bg-white border-slate-200 text-slate-900";
  const subtleTextClass = isDark ? "text-slate-400" : "text-slate-600";
  const inputClass = isDark
    ? "border border-white/15 bg-white/5 text-white placeholder:text-slate-400"
    : "border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500";
  const secondarySurfaceClass = isDark
    ? "bg-white/5 border-white/10"
    : "bg-slate-50 border-slate-200";
  const chipClass = isDark
    ? "bg-white/10 text-slate-200"
    : "bg-slate-100 text-slate-600";

  const deckMissing = mode === "create" && activeDeckId == null;

  const initializeForm = (card?: Flashcard | null) => {
    if (!card) {
      setForm({
        prompt: "",
        detail: "",
        type: "qa",
        difficulty: "standard",
        tags: [],
        references: [],
        data: createEmptyFlashcardData("qa"),
      });
      return;
    }
    setForm({
      prompt: card.prompt,
      detail: card.detail ?? "",
      type: card.type,
      difficulty: card.difficulty,
      tags: card.tags ?? [],
      references:
        card.references?.map((ref) => ({
          refType: ref.refType,
          refLabel: ref.refLabel,
          refUrl: ref.refUrl ?? "",
          refId: ref.refId ?? undefined,
          extra: ref.extra ?? undefined,
        })) ?? [],
      data: card.data ?? createEmptyFlashcardData(card.type),
    });
  };

  useEffect(() => {
    if (open) {
      initializeForm(mode === "edit" ? (editingCard ?? null) : null);
      setTagInput("");
    }
  }, [open, mode, editingCard]);

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
    value: string | boolean,
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

  const handleBlankChange = (
    blankId: string,
    field: "placeholder" | "answer",
    value: string,
  ) => {
    setForm((prev) => {
      const blanks = prev.data.blanks ?? [];
      return {
        ...prev,
        data: {
          ...prev.data,
          blanks: blanks.map((blank: any) =>
            blank.id === blankId ? { ...blank, [field]: value } : blank,
          ),
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

  const addBlank = () => {
    setForm((prev) => ({
      ...prev,
      data: {
        ...prev.data,
        blanks: [
          ...(prev.data.blanks ?? []),
          {
            id: randomId(),
            placeholder: `空格 ${(prev.data.blanks?.length ?? 0) + 1}`,
            answer: "",
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
          refType: "card",
          refLabel: "",
          refUrl: "",
        },
      ],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.prompt.trim() || deckMissing) {
      return;
    }
    setSaving(true);
    try {
      const payload = {
        type: form.type,
        prompt: form.prompt.trim(),
        detail: form.detail.trim(),
        difficulty: form.difficulty,
        tags: form.tags,
        data: form.data,
        references: form.references.filter((ref) => ref.refLabel?.trim()),
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
              className={`flex items-center gap-3 rounded-2xl p-3 border ${secondarySurfaceClass}`}
            >
              <input
                value={option.label}
                onChange={(e) =>
                  handleOptionChange(option.id, "label", e.target.value)
                }
                placeholder={`选项 ${index + 1}`}
                className={`flex-1 bg-transparent text-sm focus:outline-none ${
                  isDark ? "text-white" : "text-slate-900"
                }`}
              />
              <label
                className={`flex items-center gap-2 text-xs ${subtleTextClass}`}
              >
                <input
                  type="checkbox"
                  checked={option.isCorrect}
                  onChange={(e) =>
                    handleOptionChange(option.id, "isCorrect", e.target.checked)
                  }
                  className="accent-emerald-400"
                />
                正确
              </label>
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className={`w-full rounded-2xl border border-dashed py-3 text-sm ${subtleTextClass} ${
              isDark
                ? "border-white/20 hover:bg-white/5"
                : "border-slate-300 hover:bg-slate-100/60"
            }`}
          >
            添加选项
          </button>
        </div>
      );
    }

    if (form.type === "cloze") {
      const blanks = form.data.blanks ?? [];
      return (
        <div className="space-y-3">
          {blanks.map((blank: any, index: number) => (
            <div
              key={blank.id}
              className={`rounded-2xl border p-4 space-y-2 ${secondarySurfaceClass}`}
            >
              <p className={`text-xs ${subtleTextClass}`}>空格 {index + 1}</p>
              <input
                value={blank.placeholder}
                onChange={(e) =>
                  handleBlankChange(blank.id, "placeholder", e.target.value)
                }
                placeholder="提示文本"
                className={`w-full bg-transparent border-b text-sm focus:outline-none ${
                  isDark
                    ? "border-white/10 text-white"
                    : "border-slate-300 text-slate-900"
                }`}
              />
              <input
                value={blank.answer}
                onChange={(e) =>
                  handleBlankChange(blank.id, "answer", e.target.value)
                }
                placeholder="正确答案"
                className={`w-full bg-transparent border-b text-sm focus:outline-none ${
                  isDark
                    ? "border-white/10 text-emerald-200"
                    : "border-emerald-200 text-emerald-600"
                }`}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addBlank}
            className="w-full rounded-2xl border border-dashed border-white/20 py-3 text-sm text-slate-300 hover:bg-white/5"
          >
            添加空格
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
          className={`w-full rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${inputClass}`}
        />
      );
    }

    if (form.type === "boolean") {
      const current = form.data.booleanAnswer ?? true;
      return (
        <div className="flex gap-3">
          {[true, false].map((value) => (
            <button
              key={value ? "true" : "false"}
              type="button"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  data: { ...prev.data, booleanAnswer: value },
                }))
              }
              className={`flex-1 h-12 rounded-2xl border ${
                current === value
                  ? isDark
                    ? "border-emerald-400 bg-emerald-400/20 text-white"
                    : "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : isDark
                    ? "border-white/10 text-slate-300"
                    : "border-slate-200 text-slate-600"
              }`}
            >
              {value ? "正确" : "错误"}
            </button>
          ))}
        </div>
      );
    }

    return null;
  };

  const referenceList = useMemo(() => form.references ?? [], [form.references]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !saving && handleClose()}
          />
          <motion.form
            onSubmit={handleSubmit}
            initial={{ x: 480 }}
            animate={{ x: 0 }}
            exit={{ x: 480 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className={`relative z-10 h-full w-full max-w-2xl border-l px-8 py-10 overflow-y-auto ${surfaceClass}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p
                  className={`text-xs uppercase tracking-[0.4em] ${
                    isDark ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  {mode === "create" ? "Create" : "Update"}
                </p>
                <h2 className="text-2xl font-semibold mt-2">
                  {mode === "create" ? "新建闪卡" : "编辑闪卡"}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-lg cursor-pointer"
              >
                ×
              </button>
            </div>
            {deckMissing && (
              <div
                className={`mt-6 rounded-2xl border p-4 text-sm ${
                  isDark
                    ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                请先创建并选择一个卡组后再添加闪卡。
              </div>
            )}
            <div className="mt-6 space-y-6">
              <div>
                <label className={`block text-sm mb-2 ${subtleTextClass}`}>
                  题干
                </label>
                <textarea
                  value={form.prompt}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, prompt: e.target.value }))
                  }
                  rows={3}
                  className={`w-full rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-400 ${inputClass}`}
                />
              </div>
              <div>
                <label className={`block text-sm mb-2 ${subtleTextClass}`}>
                  详细说明 / 提示
                </label>
                <textarea
                  value={form.detail}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, detail: e.target.value }))
                  }
                  rows={2}
                  className={`w-full rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-400 ${inputClass}`}
                />
              </div>
              <div>
                <label className={`block text-sm mb-2 ${subtleTextClass}`}>
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
                          className={`rounded-2xl border px-3 py-2 text-left ${
                            active
                              ? isDark
                                ? "border-emerald-400 bg-emerald-400/10"
                                : "border-emerald-300 bg-emerald-50"
                              : isDark
                                ? "border-white/10 bg-white/5"
                                : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="text-sm font-semibold">
                            {meta.label}
                          </div>
                          <p
                            className={`text-xs line-clamp-2 ${subtleTextClass}`}
                          >
                            {meta.description}
                          </p>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
              <div>{renderTypeFields()}</div>
              <div>
                <label className="block text-sm text-slate-300 mb-2">
                  标签
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {form.tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 text-xs text-slate-100"
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
                        className="text-slate-400 hover:text-white"
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
                      if (tagInput.trim()) {
                        setForm((prev) => ({
                          ...prev,
                          tags: [...prev.tags, tagInput.trim()],
                        }));
                        setTagInput("");
                      }
                    }
                  }}
                  placeholder="输入标签后回车添加"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-2">
                  难度
                </label>
                <div className="flex gap-3">
                  {(["foundation", "standard", "advanced"] as const).map(
                    (level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({ ...prev, difficulty: level }))
                        }
                        className={`flex-1 h-12 rounded-2xl border ${
                          form.difficulty === level
                            ? "border-cyan-400 bg-cyan-400/10 text-white"
                            : "border-white/10 text-slate-300"
                        }`}
                      >
                        {level === "foundation"
                          ? "基础"
                          : level === "advanced"
                            ? "进阶"
                            : "常规"}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-slate-300">参考资料</label>
                  <button
                    type="button"
                    onClick={addReference}
                    className="text-xs text-emerald-300 hover:text-emerald-200"
                  >
                    + 添加参考
                  </button>
                </div>
                <div className="space-y-3">
                  {referenceList.map((ref, index) => (
                    <div
                      key={`${ref.refType}-${index}`}
                      className="rounded-2xl border border-white/10 bg-white/5 p-3 flex flex-col gap-2"
                    >
                      <div className="flex gap-2">
                        <select
                          value={ref.refType}
                          onChange={(e) => {
                            const value = e.target
                              .value as FlashcardReferenceInput["refType"];
                            setForm((prev) => {
                              const next = [...prev.references];
                              next[index] = {
                                ...next[index],
                                refType: value,
                              };
                              return { ...prev, references: next };
                            });
                          }}
                          className="rounded-xl bg-white/10 border border-white/10 px-2 py-1 text-xs text-white focus:outline-none"
                        >
                          {referenceTypeOptions.map((type) => (
                            <option
                              key={type}
                              value={type}
                              className="bg-slate-900"
                            >
                              {type}
                            </option>
                          ))}
                        </select>
                        <input
                          value={ref.refLabel}
                          onChange={(e) =>
                            setForm((prev) => {
                              const next = [...prev.references];
                              next[index] = {
                                ...next[index],
                                refLabel: e.target.value,
                              };
                              return { ...prev, references: next };
                            })
                          }
                          placeholder="标题或摘要"
                          className="flex-1 bg-transparent border-b border-white/10 text-sm focus:outline-none"
                        />
                      </div>
                      <input
                        value={ref.refUrl ?? ""}
                        onChange={(e) =>
                          setForm((prev) => {
                            const next = [...prev.references];
                            next[index] = {
                              ...next[index],
                              refUrl: e.target.value,
                            };
                            return { ...prev, references: next };
                          })
                        }
                        placeholder="附加链接（可选）"
                        className="w-full bg-transparent border-b border-white/10 text-xs text-slate-300 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            references: prev.references.filter(
                              (_, i) => i !== index,
                            ),
                          }))
                        }
                        className="self-end text-xs text-slate-400 hover:text-white"
                      >
                        移除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-8 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                <p>完成后可在回顾面板中立即练习</p>
                <p>应用会自动根据记忆曲线安排下次复习</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={saving}
                  className="h-11 px-6 rounded-full border border-white/10 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving || deckMissing}
                  className="h-11 px-8 rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-500/40 disabled:opacity-50"
                >
                  {saving
                    ? "保存中..."
                    : mode === "create"
                      ? "创建闪卡"
                      : "保存修改"}
                </button>
              </div>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FlashcardEditor;
