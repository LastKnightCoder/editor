import {
  notebookTranslator,
  notebookCount,
  useNotebookI18n,
  notebookError,
} from "@/features/vibe-learning/i18n";
import { memo, useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { Pencil, Trash2, Check, X, ChevronDown, Plus, Save, CircleAlert } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogBody,
  IconButton,
  Input,
  Radio,
  Segmented,
  Spinner,
  Tag,
  Textarea,
  cn,
  toast,
  type TagColor,
} from "@tau/ui";

import { useQuizItems, useQuizMutations } from "../../../../quizQueries";
import { ErrorState } from "@/components/ErrorState";
import type { VLQuizSet, VLQuizItem, UpdateVLQuizItemInput } from "@/types";
import type { FlashcardOption } from "@/types/flashcard";
import { extractPlainText } from "@/utils/flashcard";
const t = notebookTranslator.t;

interface QuizEditModalProps {
  open: boolean;
  quizSet: VLQuizSet | null;
  onClose: () => void;
}

// 难度显示
const DIFFICULTY_LABELS: Record<string, string> = {
  get foundation() {
    return t("quiz.foundation");
  },
  get standard() {
    return t("quiz.standard");
  },
  get advanced() {
    return t("quiz.advanced");
  },
};

const DIFFICULTY_COLORS: Record<string, TagColor> = {
  foundation: "green",
  standard: "yellow",
  advanced: "red",
};

// 题型显示名称
const getTypeLabel = (type: string) => {
  return (
    (
      {
        "single-choice": t("quiz.single"),
        "multiple-choice": t("quiz.multiple"),
        cloze: t("quiz.cloze"),
        qa: t("quiz.qa"),
        boolean: t("quiz.boolean"),
      } as Record<string, string>
    )[type] || type
  );
};

/** 字段标签：12px 淡墨，放在内容上方 */
function FieldLabel({ children, extra }: { children: string; extra?: ReactNode }) {
  useNotebookI18n();
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="text-ink-2 text-[12px]">{children}</span>
      <span className="flex-1" />
      {extra}
    </div>
  );
}

const QuizEditModal = memo((props: QuizEditModalProps) => {
  useNotebookI18n();
  const { open, quizSet, onClose } = props;

  const itemsQuery = useQuizItems(quizSet?.id, open);
  const items = itemsQuery.items;
  const loadingItems = itemsQuery.isPending;
  const { updateQuizSet, updateItem, deleteItem } = useQuizMutations();

  // 本地状态
  const [quizName, setQuizName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  useEffect(() => {
    if (open && quizSet) {
      setQuizName(quizSet.name);
      setIsEditingName(false);
      setExpandedItemId(null);
      setEditingItemId(null);
    }
  }, [open, quizSet]);

  const handleSaveName = useMemoizedFn(async () => {
    if (!quizSet || !quizName.trim()) return;
    if (quizName.trim() === quizSet.name) {
      setIsEditingName(false);
      return;
    }

    setSavingName(true);
    try {
      await updateQuizSet({ id: quizSet.id, name: quizName.trim() });
      toast.success(t("quiz.nameUpdated"));
      setIsEditingName(false);
    } catch (error) {
      toast.error(t("common.updateFailed"));
    } finally {
      setSavingName(false);
    }
  });

  const handleCancelEditName = useMemoizedFn(() => {
    if (quizSet) {
      setQuizName(quizSet.name);
    }
    setIsEditingName(false);
  });

  const [deleteItemConfirm, setDeleteItemConfirm] = useState<VLQuizItem | null>(null);
  const handleDeleteItem = useMemoizedFn((item: VLQuizItem) => {
    setDeleteItemConfirm(item);
  });

  // 展开/收起题目
  const handleToggleExpand = useMemoizedFn((itemId: number) => {
    setExpandedItemId(prev => (prev === itemId ? null : itemId));
    // 收起编辑状态
    if (expandedItemId === itemId) {
      setEditingItemId(null);
    }
  });

  const handleStartEdit = useMemoizedFn((itemId: number) => {
    setEditingItemId(itemId);
    setExpandedItemId(itemId);
  });

  const handleCloseEdit = useMemoizedFn(() => {
    setEditingItemId(null);
  });

  const handleClose = useMemoizedFn(() => {
    setEditingItemId(null);
    setExpandedItemId(null);
    onClose();
  });

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && handleClose()}
      title={t("quiz.edit")}
      subtitle={t("quiz.editHint")}
      icon={<Pencil className="size-4" strokeWidth={1.75} />}
      width={700}
    >
      <DialogBody>
        <div className="flex flex-col gap-5 pt-1">
          {/* 测验名称编辑 */}
          <div>
            <FieldLabel>{t("quiz.name")}</FieldLabel>
            {isEditingName ? (
              <div className="flex items-center gap-1.5">
                <Input
                  data-autofocus
                  autoFocus
                  value={quizName}
                  onChange={e => setQuizName(e.target.value)}
                  wrapperClassName="flex-1"
                  onKeyDown={e => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") {
                      // Esc 只退出名称编辑，不关闭弹窗
                      e.stopPropagation();
                      e.preventDefault();
                      handleCancelEditName();
                    }
                  }}
                />
                <Button
                  variant="primary"
                  size="sm"
                  icon={Check}
                  loading={savingName}
                  disabled={savingName || !quizName.trim()}
                  onClick={handleSaveName}
                >
                  {t("common.save")}
                </Button>
                <IconButton
                  aria-label={t("common.cancel")}
                  title={t("common.cancel")}
                  onClick={handleCancelEditName}
                >
                  <X className="size-4" strokeWidth={1.75} />
                </IconButton>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingName(true)}
                className={cn(
                  "border-line-1 bg-surface rounded-tau-sm group flex h-[34px] w-full cursor-pointer",
                  "items-center justify-between border px-3 text-left",
                  "hover:bg-hover ease-tau-out transition-[background-color] duration-[140ms]"
                )}
              >
                <span className="text-ink-1 text-tau-body truncate">
                  {quizSet?.name || t("common.unnamed")}
                </span>
                <Pencil
                  className="text-ink-3 group-hover:text-ink-2 size-3.5 shrink-0"
                  strokeWidth={1.75}
                />
              </button>
            )}
          </div>

          {/* 题目列表 */}
          <div>
            <FieldLabel
              extra={
                <span className="text-ink-3 text-tau-meta">
                  {notebookCount("stage.questions", items.length)}
                </span>
              }
            >
              {t("quiz.questions")}
            </FieldLabel>

            {itemsQuery.isError ? (
              <ErrorState
                title={t("quiz.loadFailed")}
                error={notebookError(itemsQuery.error, "quiz.loadFailed")}
                actions={[{ label: t("common.retry"), onClick: () => void itemsQuery.refetch() }]}
              />
            ) : loadingItems ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <Spinner className="size-5" />
                <p className="text-ink-3 text-tau-meta m-0">{t("quiz.loading")}</p>
              </div>
            ) : items.length === 0 ? (
              <div className="border-line-1 rounded-tau-md flex flex-col items-center justify-center gap-2 border border-dashed py-12">
                <CircleAlert className="text-ink-3 size-6" strokeWidth={1.75} />
                <p className="text-ink-3 text-tau-meta m-0">{t("quiz.noQuestions")}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {items.map((item, index) => (
                  <QuizItemCard
                    key={item.id}
                    item={item}
                    index={index}
                    isExpanded={expandedItemId === item.id}
                    isEditing={editingItemId === item.id}
                    onToggleExpand={() => handleToggleExpand(item.id)}
                    onStartEdit={() => handleStartEdit(item.id)}
                    onCloseEdit={handleCloseEdit}
                    onDelete={() => handleDeleteItem(item)}
                    updateItem={updateItem}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <ConfirmDialog
          open={deleteItemConfirm !== null}
          onOpenChange={next => {
            if (!next) setDeleteItemConfirm(null);
          }}
          title={t("quiz.deleteQuestion")}
          description={t("quiz.deleteQuestionHint")}
          danger
          confirmText={t("common.delete")}
          onConfirm={async () => {
            const item = deleteItemConfirm;
            if (!item) return;
            try {
              await deleteItem(item.id);
              setDeleteItemConfirm(null);
              toast.success(t("quiz.questionDeleted"));
            } catch (error) {
              toast.error(t("common.deleteFailed"));
              throw error;
            }
          }}
        />
      </DialogBody>
    </Dialog>
  );
});

QuizEditModal.displayName = "QuizEditModal";

// 题目卡片组件
interface QuizItemCardProps {
  item: VLQuizItem;
  index: number;
  isExpanded: boolean;
  isEditing: boolean;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onCloseEdit: () => void;
  onDelete: () => void;
  updateItem: (payload: UpdateVLQuizItemInput) => Promise<VLQuizItem | null>;
}

const QuizItemCard = memo((props: QuizItemCardProps) => {
  useNotebookI18n();
  const {
    item,
    index,
    isExpanded,
    isEditing,
    onToggleExpand,
    onStartEdit,
    onCloseEdit,
    onDelete,
    updateItem,
  } = props;

  const promptPreview = useMemo(() => {
    return extractPlainText(item.prompt).slice(0, 80);
  }, [item.prompt]);

  return (
    <div
      className={cn("rounded-tau-md border", isExpanded ? "border-line-1" : "border-transparent")}
    >
      {/* 题目头部 */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={onToggleExpand}
        onKeyDown={e => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        className={cn(
          "group flex cursor-pointer items-start gap-3 px-3 py-2.5 outline-none",
          "rounded-tau-md hover:bg-hover focus-visible:shadow-[var(--tau-focus-ring)]",
          "ease-tau-out transition-[background-color] duration-[140ms]"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="text-ink-3 text-tau-meta tabular-nums">#{index + 1}</span>
            <Tag>{getTypeLabel(item.type)}</Tag>
            <Tag color={DIFFICULTY_COLORS[item.difficulty] ?? "gray"}>
              {DIFFICULTY_LABELS[item.difficulty] || item.difficulty}
            </Tag>
          </div>
          <p className="text-ink-1 text-tau-body m-0 line-clamp-2 leading-relaxed">
            {promptPreview}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            aria-label={t("common.edit")}
            title={t("common.edit")}
            onClick={e => {
              e.stopPropagation();
              onStartEdit();
            }}
          >
            <Pencil className="size-4" strokeWidth={1.75} />
          </IconButton>
          <IconButton
            aria-label={t("common.delete")}
            title={t("common.delete")}
            className="hover:text-danger"
            onClick={e => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
          </IconButton>
          <ChevronDown
            className={cn(
              "text-ink-3 ml-1 size-4 transition-transform duration-[160ms]",
              isExpanded && "rotate-180"
            )}
            strokeWidth={1.75}
          />
        </div>
      </div>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="px-3 pt-1 pb-3">
          {isEditing ? (
            <QuizItemEditForm item={item} onSave={updateItem} onCancel={onCloseEdit} />
          ) : (
            <QuizItemPreview item={item} />
          )}
        </div>
      )}
    </div>
  );
});

QuizItemCard.displayName = "QuizItemCard";

// 题目预览组件
interface QuizItemPreviewProps {
  item: VLQuizItem;
}

const QuizItemPreview = memo((props: QuizItemPreviewProps) => {
  useNotebookI18n();
  const { item } = props;

  const renderContent = () => {
    switch (item.type) {
      case "single-choice":
      case "multiple-choice": {
        const options = item.data.options || [];
        return (
          <div>
            <FieldLabel>{t("quiz.option")}</FieldLabel>
            <div className="flex flex-col gap-1.5">
              {options.map((opt, idx) => (
                <div
                  key={opt.id}
                  className={cn(
                    "rounded-tau-sm text-tau-body flex items-center gap-2 border px-3 py-2",
                    opt.isCorrect ? "border-ok bg-ok-soft text-ink-1" : "border-line-1 text-ink-2"
                  )}
                >
                  <span className="text-ink-3 tabular-nums">{String.fromCharCode(65 + idx)}.</span>
                  <span className="flex-1">{opt.label}</span>
                  {opt.isCorrect && <Check className="text-ok size-4" strokeWidth={1.75} />}
                </div>
              ))}
            </div>
          </div>
        );
      }
      case "boolean": {
        const answer = item.data.booleanAnswer;
        return (
          <div className="flex items-center gap-2">
            <span className="text-ink-2 text-[12px]">{t("quiz.correctAnswer")}</span>
            <Tag color={answer ? "green" : "red"}>{answer ? t("quiz.true") : t("quiz.false")}</Tag>
          </div>
        );
      }
      case "qa": {
        return (
          <div>
            <FieldLabel>{t("quiz.reference")}</FieldLabel>
            <p className="border-line-1 rounded-tau-sm text-ink-2 text-tau-body m-0 border px-3 py-2 whitespace-pre-wrap">
              {item.data.answer || t("quiz.noAnswer")}
            </p>
          </div>
        );
      }
      case "cloze": {
        return <p className="text-ink-3 text-tau-meta m-0">{t("quiz.clozeHint")}</p>;
      }
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {renderContent()}
      {item.data.explanation && (
        <div>
          <FieldLabel>{t("quiz.explanation")}</FieldLabel>
          <p className="text-ink-2 text-tau-body m-0 leading-relaxed">{item.data.explanation}</p>
        </div>
      )}
    </div>
  );
});

QuizItemPreview.displayName = "QuizItemPreview";

// 题目编辑表单组件
interface QuizItemEditFormProps {
  item: VLQuizItem;
  onSave: (payload: UpdateVLQuizItemInput) => Promise<VLQuizItem | null>;
  onCancel: () => void;
}

const QuizItemEditForm = memo((props: QuizItemEditFormProps) => {
  useNotebookI18n();
  const { item, onSave, onCancel } = props;

  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(() => ({
    options: item.data.options ? [...item.data.options.map(o => ({ ...o }))] : [],
    booleanAnswer: item.data.booleanAnswer ?? true,
    answer: item.data.answer ?? "",
    explanation: item.data.explanation ?? "",
  }));

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const newData = { ...item.data };

      if (item.type === "single-choice" || item.type === "multiple-choice") {
        if (formData.options.some(opt => !opt.label.trim())) {
          toast.error(t("quiz.fillOptions"));
          setSaving(false);
          return;
        }
        if (!formData.options.some(opt => opt.isCorrect)) {
          toast.error(t("quiz.pickCorrect"));
          setSaving(false);
          return;
        }
        newData.options = formData.options;
      } else if (item.type === "boolean") {
        newData.booleanAnswer = formData.booleanAnswer;
      } else if (item.type === "qa") {
        newData.answer = formData.answer;
      }

      newData.explanation = formData.explanation;

      await onSave({ id: item.id, data: newData });
      toast.success(t("common.saveSuccess"));
      onCancel();
    } catch (error) {
      toast.error(t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [item, formData, onSave, onCancel]);

  const updateOption = useCallback((index: number, updates: Partial<FlashcardOption>) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.map((opt, i) => (i === index ? { ...opt, ...updates } : opt)),
    }));
  }, []);

  const setCorrectOption = useCallback(
    (index: number) => {
      if (item.type === "single-choice") {
        setFormData(prev => ({
          ...prev,
          options: prev.options.map((opt, i) => ({
            ...opt,
            isCorrect: i === index,
          })),
        }));
      }
    },
    [item.type]
  );

  // 切换正确答案（多选）
  const toggleCorrectOption = useCallback(
    (index: number) => {
      if (item.type === "multiple-choice") {
        setFormData(prev => ({
          ...prev,
          options: prev.options.map((opt, i) =>
            i === index ? { ...opt, isCorrect: !opt.isCorrect } : opt
          ),
        }));
      }
    },
    [item.type]
  );

  const addOption = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      options: [...prev.options, { id: crypto.randomUUID(), label: "", isCorrect: false }],
    }));
  }, []);

  const removeOption = useCallback((index: number) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  }, []);

  const renderForm = () => {
    switch (item.type) {
      case "single-choice":
      case "multiple-choice": {
        const isMultiple = item.type === "multiple-choice";
        return (
          <div>
            <FieldLabel>
              {isMultiple ? t("quiz.multipleOptions") : t("quiz.singleOptions")}
            </FieldLabel>
            <div className="flex flex-col gap-1.5">
              {formData.options.map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-1.5">
                  {isMultiple ? (
                    <Checkbox
                      aria-label={t("quiz.setCorrect")}
                      checked={!!opt.isCorrect}
                      onChange={() => toggleCorrectOption(idx)}
                    />
                  ) : (
                    <Radio
                      aria-label={t("quiz.setCorrect")}
                      name={`quiz-correct-${item.id}`}
                      value={opt.id}
                      checked={!!opt.isCorrect}
                      onChange={() => setCorrectOption(idx)}
                    />
                  )}
                  <Input
                    size="sm"
                    value={opt.label}
                    onChange={e => updateOption(idx, { label: e.target.value })}
                    placeholder={t("quiz.optionNamed", { option: String.fromCharCode(65 + idx) })}
                    wrapperClassName="flex-1"
                  />
                  {formData.options.length > 2 && (
                    <IconButton
                      aria-label={t("quiz.deleteOption")}
                      title={t("quiz.deleteOption")}
                      className="hover:text-danger"
                      onClick={() => removeOption(idx)}
                    >
                      <X className="size-4" strokeWidth={1.75} />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" icon={Plus} className="mt-1.5" onClick={addOption}>
              {t("quiz.addOption")}
            </Button>
          </div>
        );
      }
      case "boolean": {
        return (
          <div>
            <FieldLabel>{t("quiz.correctAnswer")}</FieldLabel>
            <Segmented
              label={t("quiz.correctAnswer")}
              value={formData.booleanAnswer ? "true" : "false"}
              onValueChange={v =>
                setFormData(prev => ({
                  ...prev,
                  booleanAnswer: v === "true",
                }))
              }
            >
              <Segmented.Item value="true" label={t("quiz.true")} icon={Check} />
              <Segmented.Item value="false" label={t("quiz.false")} icon={X} />
            </Segmented>
          </div>
        );
      }
      case "qa": {
        return (
          <div>
            <FieldLabel>{t("quiz.reference")}</FieldLabel>
            <Textarea
              value={formData.answer}
              onChange={e => setFormData(prev => ({ ...prev, answer: e.target.value }))}
              rows={4}
              placeholder={t("quiz.referencePlaceholder")}
            />
          </div>
        );
      }
      case "cloze": {
        return <p className="text-ink-3 text-tau-meta m-0">{t("quiz.clozeEditHint")}</p>;
      }
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {renderForm()}

      {/* 解析 */}
      <div>
        <FieldLabel>{t("quiz.optionalExplanation")}</FieldLabel>
        <Textarea
          value={formData.explanation}
          onChange={e => setFormData(prev => ({ ...prev, explanation: e.target.value }))}
          rows={2}
          placeholder={t("quiz.explanationPlaceholder")}
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" size="sm" icon={Save} loading={saving} onClick={handleSave}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
});

QuizItemEditForm.displayName = "QuizItemEditForm";

export default QuizEditModal;
