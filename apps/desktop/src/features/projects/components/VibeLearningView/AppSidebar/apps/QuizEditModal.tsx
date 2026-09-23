import { memo, useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Plus,
  Loader2,
  Save,
  AlertCircle,
} from "lucide-react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";

import CustomModal from "@/components/CustomModal";
import useVLQuizStore from "@/stores/useVLQuizStore";
import type { VLQuizSet, VLQuizItem, UpdateVLQuizItemInput } from "@/types";
import type { FlashcardOption } from "@/types/flashcard";
import { FLASHCARD_TYPE_META, extractPlainText } from "@/utils/flashcard";
import { toast, ConfirmDialog } from "@tau/ui";

interface QuizEditModalProps {
  open: boolean;
  quizSet: VLQuizSet | null;
  onClose: () => void;
}

const QuizEditModal = memo((props: QuizEditModalProps) => {
  const { open, quizSet, onClose } = props;

  const {
    itemsByQuizSet,
    loadingItems,
    fetchItems,
    updateQuizSet,
    updateItem,
    deleteItem,
    fetchQuizSets,
    currentProjectId,
  } = useVLQuizStore();

  // 本地状态
  const [quizName, setQuizName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  // 获取当前测验集的题目
  const items = useMemo(() => {
    if (!quizSet) return [];
    return itemsByQuizSet[quizSet.id] ?? [];
  }, [quizSet, itemsByQuizSet]);

  // 初始化
  useEffect(() => {
    if (open && quizSet) {
      setQuizName(quizSet.name);
      setIsEditingName(false);
      setExpandedItemId(null);
      setEditingItemId(null);
      // 加载题目
      fetchItems(quizSet.id);
    }
  }, [open, quizSet, fetchItems]);

  // 保存测验集名称
  const handleSaveName = useMemoizedFn(async () => {
    if (!quizSet || !quizName.trim()) return;
    if (quizName.trim() === quizSet.name) {
      setIsEditingName(false);
      return;
    }

    setSavingName(true);
    try {
      await updateQuizSet({ id: quizSet.id, name: quizName.trim() });
      toast.success("名称已更新");
      setIsEditingName(false);
    } catch (error) {
      toast.error("更新失败");
    } finally {
      setSavingName(false);
    }
  });

  // 取消编辑名称
  const handleCancelEditName = useMemoizedFn(() => {
    if (quizSet) {
      setQuizName(quizSet.name);
    }
    setIsEditingName(false);
  });

  // 删除题目
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

  // 开始编辑题目
  const handleStartEdit = useMemoizedFn((itemId: number) => {
    setEditingItemId(itemId);
    setExpandedItemId(itemId);
  });

  // 关闭编辑
  const handleCloseEdit = useMemoizedFn(() => {
    setEditingItemId(null);
  });

  // 关闭弹窗
  const handleClose = useMemoizedFn(() => {
    setEditingItemId(null);
    setExpandedItemId(null);
    onClose();
  });

  // 题型显示名称
  const getTypeLabel = (type: string) => {
    return FLASHCARD_TYPE_META[type as keyof typeof FLASHCARD_TYPE_META]?.label || type;
  };

  // 难度显示
  const difficultyLabels: Record<string, string> = {
    foundation: "基础",
    standard: "标准",
    advanced: "进阶",
  };

  const difficultyColors: Record<string, string> = {
    foundation: "bg-[var(--th-success)]/15 text-status-success",
    standard: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
    advanced: "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400",
  };

  return (
    <CustomModal
      open={open}
      onCancel={handleClose}
      width={700}
      centered
      destroyOnClose
      title="编辑测验"
      subtitle="修改测验信息和题目内容"
      icon={<Pencil className="h-5 w-5 text-[var(--th-text-secondary)]" strokeWidth={1.75} />}
      footer={null}
    >
      <div className="space-y-6">
        {/* 测验名称编辑 */}
        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
            测验名称
          </label>
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={quizName}
                onChange={e => setQuizName(e.target.value)}
                autoFocus
                className={classNames(
                  "flex-1 rounded-xl px-4 py-2.5 text-sm outline-none transition-all",
                  "border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-zinc-800/50",
                  "text-gray-800 dark:text-white",
                  "focus:ring-[var(--th-accent)]/20 focus:border-[var(--th-border-focus)] focus:ring-2"
                )}
                onKeyDown={e => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") handleCancelEditName();
                }}
              />
              <button
                type="button"
                onClick={handleSaveName}
                disabled={savingName || !quizName.trim()}
                className={classNames(
                  "rounded-lg p-2.5 transition-all",
                  "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] hover:bg-[var(--th-btn-hover)]",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                {savingName ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                ) : (
                  <Check className="h-4 w-4" strokeWidth={1.75} />
                )}
              </button>
              <button
                type="button"
                onClick={handleCancelEditName}
                className="rounded-lg bg-gray-100 p-2.5 text-gray-600 transition-all hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-400 dark:hover:bg-zinc-700"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          ) : (
            <div
              onClick={() => setIsEditingName(true)}
              className={classNames(
                "flex cursor-pointer items-center justify-between rounded-xl px-4 py-2.5 transition-all",
                "border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-zinc-800/50",
                "hover:border-[var(--th-border-hover)] dark:hover:border-[var(--th-border-focus)]"
              )}
            >
              <span className="text-sm text-gray-800 dark:text-white">
                {quizSet?.name || "未命名"}
              </span>
              <Pencil className="h-4 w-4 text-gray-400" strokeWidth={1.75} />
            </div>
          )}
        </div>

        {/* 题目列表 */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              题目列表
            </label>
            <span className="text-xs text-gray-400 dark:text-gray-500">共 {items.length} 题</span>
          </div>

          {loadingItems ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2
                className="h-8 w-8 animate-spin text-[var(--th-accent)]"
                strokeWidth={1.75}
              />
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">加载题目中...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-12 dark:border-gray-700">
              <AlertCircle
                className="mb-3 h-12 w-12 text-gray-300 dark:text-gray-600"
                strokeWidth={1.75}
              />
              <p className="text-sm text-gray-500 dark:text-gray-400">暂无题目</p>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-auto rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-zinc-800/50">
              <AnimatePresence>
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
                    getTypeLabel={getTypeLabel}
                    difficultyLabels={difficultyLabels}
                    difficultyColors={difficultyColors}
                    updateItem={updateItem}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteItemConfirm !== null}
        onOpenChange={next => {
          if (!next) setDeleteItemConfirm(null);
        }}
        title="删除题目"
        description="确定要删除这道题目吗？此操作无法撤销。"
        danger
        confirmText="删除"
        onConfirm={async () => {
          const item = deleteItemConfirm;
          setDeleteItemConfirm(null);
          if (!item) return;
          try {
            await deleteItem(item.id);
            toast.success("题目已删除");
            // 刷新测验集列表以更新题目数量
            if (currentProjectId) {
              fetchQuizSets(currentProjectId);
            }
          } catch (error) {
            toast.error("删除失败");
          }
        }}
      />
    </CustomModal>
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
  getTypeLabel: (type: string) => string;
  difficultyLabels: Record<string, string>;
  difficultyColors: Record<string, string>;
  updateItem: (payload: UpdateVLQuizItemInput) => Promise<VLQuizItem | null>;
}

const QuizItemCard = memo((props: QuizItemCardProps) => {
  const {
    item,
    index,
    isExpanded,
    isEditing,
    onToggleExpand,
    onStartEdit,
    onCloseEdit,
    onDelete,
    getTypeLabel,
    difficultyLabels,
    difficultyColors,
    updateItem,
  } = props;

  // 获取题干预览文本
  const promptPreview = useMemo(() => {
    return extractPlainText(item.prompt).slice(0, 80);
  }, [item.prompt]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ delay: index * 0.02 }}
      className={classNames(
        "border-b border-gray-100 last:border-b-0 dark:border-gray-700/50",
        "transition-all"
      )}
    >
      {/* 题目头部 */}
      <div
        className={classNames(
          "flex cursor-pointer items-start gap-3 px-4 py-3 transition-all",
          "hover:bg-gray-100 dark:hover:bg-zinc-700/50",
          isExpanded && "bg-gray-100 dark:bg-zinc-700/50"
        )}
        onClick={onToggleExpand}
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
              #{index + 1}
            </span>
            <span className="bg-[var(--th-info)]/15 dark:bg-[var(--th-accent)]/20 rounded-md px-2 py-0.5 text-[10px] font-semibold text-[var(--th-active-text)]">
              {getTypeLabel(item.type)}
            </span>
            <span
              className={classNames(
                "rounded-md px-2 py-0.5 text-[10px] font-semibold",
                difficultyColors[item.difficulty] ||
                  "bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-gray-400"
              )}
            >
              {difficultyLabels[item.difficulty] || item.difficulty}
            </span>
          </div>
          <p className="m-0 line-clamp-2 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            {promptPreview}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onStartEdit();
            }}
            className="dark:hover:bg-[var(--th-btn-hover)]/10 rounded-lg p-1.5 text-gray-400 transition-all hover:bg-[var(--th-accent-soft)] hover:text-[var(--th-accent)]"
            title="编辑"
          >
            <Pencil className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
            title="删除"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" strokeWidth={1.75} />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" strokeWidth={1.75} />
          )}
        </div>
      </div>

      {/* 展开内容 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {isEditing ? (
                <QuizItemEditForm item={item} onSave={updateItem} onCancel={onCloseEdit} />
              ) : (
                <QuizItemPreview item={item} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

QuizItemCard.displayName = "QuizItemCard";

// 题目预览组件
interface QuizItemPreviewProps {
  item: VLQuizItem;
}

const QuizItemPreview = memo((props: QuizItemPreviewProps) => {
  const { item } = props;

  const renderContent = () => {
    switch (item.type) {
      case "single-choice":
      case "multiple-choice": {
        const options = item.data.options || [];
        return (
          <div className="space-y-2">
            <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">选项：</p>
            {options.map((opt, idx) => (
              <div
                key={opt.id}
                className={classNames(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                  opt.isCorrect
                    ? "border-[var(--th-success)]/30 bg-[var(--th-success)]/10 text-status-success border"
                    : "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-400"
                )}
              >
                <span className="font-medium">{String.fromCharCode(65 + idx)}.</span>
                <span className="flex-1">{opt.label}</span>
                {opt.isCorrect && (
                  <Check className="text-status-success h-4 w-4" strokeWidth={1.75} />
                )}
              </div>
            ))}
          </div>
        );
      }
      case "boolean": {
        const answer = item.data.booleanAnswer;
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">正确答案：</span>
            <span
              className={classNames(
                "rounded-lg px-3 py-1 text-sm font-medium",
                answer
                  ? "bg-[var(--th-success)]/10 text-status-success"
                  : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
              )}
            >
              {answer ? "正确" : "错误"}
            </span>
          </div>
        );
      }
      case "qa": {
        return (
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">参考答案：</p>
            <p className="whitespace-pre-wrap rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 dark:bg-zinc-800 dark:text-gray-300">
              {item.data.answer || "暂无答案"}
            </p>
          </div>
        );
      }
      case "cloze": {
        return (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              填空题（答案已在题干中标记）
            </p>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="border-t border-gray-100 pt-2 dark:border-gray-700/50">
      {renderContent()}
      {item.data.explanation && (
        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-700/50">
          <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">解析：</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">{item.data.explanation}</p>
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
  const { item, onSave, onCancel } = props;

  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(() => ({
    options: item.data.options ? [...item.data.options.map(o => ({ ...o }))] : [],
    booleanAnswer: item.data.booleanAnswer ?? true,
    answer: item.data.answer ?? "",
    explanation: item.data.explanation ?? "",
  }));

  // 保存
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const newData = { ...item.data };

      if (item.type === "single-choice" || item.type === "multiple-choice") {
        // 验证选项
        if (formData.options.some(opt => !opt.label.trim())) {
          toast.error("请填写所有选项内容");
          setSaving(false);
          return;
        }
        if (!formData.options.some(opt => opt.isCorrect)) {
          toast.error("请至少选择一个正确答案");
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
      toast.success("保存成功");
      onCancel();
    } catch (error) {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }, [item, formData, onSave, onCancel]);

  // 更新选项
  const updateOption = useCallback((index: number, updates: Partial<FlashcardOption>) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.map((opt, i) => (i === index ? { ...opt, ...updates } : opt)),
    }));
  }, []);

  // 设置正确答案（单选）
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

  // 添加选项
  const addOption = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      options: [...prev.options, { id: crypto.randomUUID(), label: "", isCorrect: false }],
    }));
  }, []);

  // 删除选项
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
          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              选项 {isMultiple ? "（可多选）" : "（单选）"}：
            </p>
            {formData.options.map((opt, idx) => (
              <div key={opt.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => (isMultiple ? toggleCorrectOption(idx) : setCorrectOption(idx))}
                  className={classNames(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                    opt.isCorrect
                      ? "bg-status-success border-[var(--th-success)] text-white"
                      : "border-gray-300 hover:border-[var(--th-success)] dark:border-gray-600"
                  )}
                >
                  {opt.isCorrect && <Check className="h-3 w-3" strokeWidth={1.75} />}
                </button>
                <input
                  type="text"
                  value={opt.label}
                  onChange={e => updateOption(idx, { label: e.target.value })}
                  placeholder={`选项 ${String.fromCharCode(65 + idx)}`}
                  className={classNames(
                    "flex-1 rounded-lg px-3 py-2 text-sm outline-none transition-all",
                    "border border-gray-200 bg-white dark:border-gray-700 dark:bg-zinc-800",
                    "text-gray-800 dark:text-white",
                    "focus:ring-[var(--th-accent)]/20 focus:border-[var(--th-border-focus)] focus:ring-1"
                  )}
                />
                {formData.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addOption}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--th-accent)] hover:text-[var(--th-accent)]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              添加选项
            </button>
          </div>
        );
      }
      case "boolean": {
        return (
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">正确答案：</p>
            <div className="flex gap-3">
              {[
                { value: true, label: "正确" },
                { value: false, label: "错误" },
              ].map(opt => (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() =>
                    setFormData(prev => ({
                      ...prev,
                      booleanAnswer: opt.value,
                    }))
                  }
                  className={classNames(
                    "flex-1 rounded-lg border-2 py-3 font-medium transition-all",
                    formData.booleanAnswer === opt.value
                      ? opt.value
                        ? "border-[var(--th-success)]/40 bg-[var(--th-success)]/10 text-status-success"
                        : "border-red-500 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                      : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-zinc-800 dark:text-gray-400"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        );
      }
      case "qa": {
        return (
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">参考答案：</p>
            <textarea
              value={formData.answer}
              onChange={e => setFormData(prev => ({ ...prev, answer: e.target.value }))}
              rows={4}
              placeholder="输入参考答案..."
              className={classNames(
                "w-full resize-none rounded-lg px-3 py-2 text-sm outline-none transition-all",
                "border border-gray-200 bg-white dark:border-gray-700 dark:bg-zinc-800",
                "text-gray-800 placeholder:text-gray-400 dark:text-white",
                "focus:ring-[var(--th-accent)]/20 focus:border-[var(--th-border-focus)] focus:ring-1"
              )}
            />
          </div>
        );
      }
      case "cloze": {
        return (
          <div className="py-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              填空题的答案在题干中编辑，此处暂不支持修改填空内容。
            </p>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 border-t border-gray-100 pt-3 dark:border-gray-700/50">
      {renderForm()}

      {/* 解析 */}
      <div>
        <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">解析（可选）：</p>
        <textarea
          value={formData.explanation}
          onChange={e => setFormData(prev => ({ ...prev, explanation: e.target.value }))}
          rows={2}
          placeholder="输入题目解析..."
          className={classNames(
            "w-full resize-none rounded-lg px-3 py-2 text-sm outline-none transition-all",
            "border border-gray-200 bg-white dark:border-gray-700 dark:bg-zinc-800",
            "text-gray-800 placeholder:text-gray-400 dark:text-white",
            "focus:ring-[var(--th-accent)]/20 focus:border-[var(--th-border-focus)] focus:ring-1"
          )}
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className={classNames(
            "rounded-lg px-4 py-2 text-sm font-medium transition-all",
            "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-400",
            "hover:bg-gray-200 dark:hover:bg-zinc-700"
          )}
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={classNames(
            "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all",
            "bg-[var(--th-btn-bg)] text-[var(--th-btn-text)] hover:bg-[var(--th-btn-hover)]",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
          ) : (
            <Save className="h-4 w-4" strokeWidth={1.75} />
          )}
          保存
        </button>
      </div>
    </div>
  );
});

QuizItemEditForm.displayName = "QuizItemEditForm";

export default QuizEditModal;
