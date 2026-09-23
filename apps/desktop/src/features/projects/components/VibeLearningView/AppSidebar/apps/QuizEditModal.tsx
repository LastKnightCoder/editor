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
    foundation: "bg-ok/15 text-status-success",
    standard: "bg-amber-100 text-amber-600",
    advanced: "bg-red-100 text-red-600",
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
      icon={<Pencil className="text-ink-2 h-5 w-5" strokeWidth={1.75} />}
      footer={null}
    >
      <div className="space-y-6">
        {/* 测验名称编辑 */}
        <div>
          <label className="text-ink-2 mb-2 block text-[11px] font-semibold uppercase tracking-wider">
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
                  "border-line-1 bg-group border",
                  "text-ink-1",
                  "focus:ring-accent/20 focus:border-accent focus:ring-2"
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
                  "bg-accent hover:bg-accent-hover text-white",
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
                className="bg-group text-ink-2 hover:bg-sunken rounded-lg p-2.5 transition-all"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          ) : (
            <div
              onClick={() => setIsEditingName(true)}
              className={classNames(
                "flex cursor-pointer items-center justify-between rounded-xl px-4 py-2.5 transition-all",
                "border-line-1 bg-group border",
                "hover:border-line-1"
              )}
            >
              <span className="text-ink-1 text-sm">{quizSet?.name || "未命名"}</span>
              <Pencil className="text-ink-3 h-4 w-4" strokeWidth={1.75} />
            </div>
          )}
        </div>

        {/* 题目列表 */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <label className="text-ink-2 text-[11px] font-semibold uppercase tracking-wider">
              题目列表
            </label>
            <span className="text-ink-3 text-xs">共 {items.length} 题</span>
          </div>

          {loadingItems ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="text-accent h-8 w-8 animate-spin" strokeWidth={1.75} />
              <p className="text-ink-2 mt-3 text-sm">加载题目中...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="border-line-1 flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-12">
              <AlertCircle className="text-ink-3 mb-3 h-12 w-12" strokeWidth={1.75} />
              <p className="text-ink-2 text-sm">暂无题目</p>
            </div>
          ) : (
            <div className="border-line-1 bg-group max-h-[400px] overflow-auto rounded-xl border">
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
      className={classNames("border-line-1 border-b last:border-b-0", "transition-all")}
    >
      {/* 题目头部 */}
      <div
        className={classNames(
          "flex cursor-pointer items-start gap-3 px-4 py-3 transition-all",
          "hover:bg-hover/50",
          isExpanded && "bg-group"
        )}
        onClick={onToggleExpand}
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-ink-3 text-xs font-medium">#{index + 1}</span>
            <span className="bg-info/15 text-accent-text rounded-md px-2 py-0.5 text-[10px] font-semibold">
              {getTypeLabel(item.type)}
            </span>
            <span
              className={classNames(
                "rounded-md px-2 py-0.5 text-[10px] font-semibold",
                difficultyColors[item.difficulty] || "bg-group text-ink-2"
              )}
            >
              {difficultyLabels[item.difficulty] || item.difficulty}
            </span>
          </div>
          <p className="text-ink-2 m-0 line-clamp-2 text-sm leading-relaxed">{promptPreview}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onStartEdit();
            }}
            className="/10 text-ink-3 hover:bg-accent-soft hover:text-accent rounded-lg p-1.5 transition-all"
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
            className="text-ink-3 rounded-lg p-1.5 transition-all hover:bg-red-50 hover:text-red-500"
            title="删除"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
          {isExpanded ? (
            <ChevronUp className="text-ink-3 h-4 w-4" strokeWidth={1.75} />
          ) : (
            <ChevronDown className="text-ink-3 h-4 w-4" strokeWidth={1.75} />
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
            <p className="text-ink-2 mb-2 text-xs font-medium">选项：</p>
            {options.map((opt, idx) => (
              <div
                key={opt.id}
                className={classNames(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                  opt.isCorrect
                    ? "border-ok/30 bg-ok/10 text-status-success border"
                    : "bg-group text-ink-2"
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
            <span className="text-ink-2 text-xs font-medium">正确答案：</span>
            <span
              className={classNames(
                "rounded-lg px-3 py-1 text-sm font-medium",
                answer ? "bg-ok/10 text-status-success" : "bg-red-50 text-red-600"
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
            <p className="text-ink-2 mb-1 text-xs font-medium">参考答案：</p>
            <p className="bg-group text-ink-2 whitespace-pre-wrap rounded-lg px-3 py-2 text-sm">
              {item.data.answer || "暂无答案"}
            </p>
          </div>
        );
      }
      case "cloze": {
        return (
          <div>
            <p className="text-ink-2 text-xs font-medium">填空题（答案已在题干中标记）</p>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="border-line-1 border-t pt-2">
      {renderContent()}
      {item.data.explanation && (
        <div className="border-line-1 mt-3 border-t pt-3">
          <p className="text-ink-2 mb-1 text-xs font-medium">解析：</p>
          <p className="text-ink-2 text-sm">{item.data.explanation}</p>
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
            <p className="text-ink-2 text-xs font-medium">
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
                      ? "bg-status-success border-ok text-white"
                      : "border-line-1 hover:border-ok"
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
                    "border-line-1 bg-surface border",
                    "text-ink-1",
                    "focus:ring-accent/20 focus:border-accent focus:ring-1"
                  )}
                />
                {formData.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="text-ink-3 shrink-0 rounded-lg p-1.5 transition-all hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addOption}
              className="text-accent hover:text-accent flex items-center gap-1.5 text-xs font-medium"
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
            <p className="text-ink-2 mb-2 text-xs font-medium">正确答案：</p>
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
                        ? "border-ok/40 bg-ok/10 text-status-success"
                        : "border-red-500 bg-red-50 text-red-600"
                      : "border-line-1 bg-group text-ink-2 hover:border-line-1"
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
            <p className="text-ink-2 mb-2 text-xs font-medium">参考答案：</p>
            <textarea
              value={formData.answer}
              onChange={e => setFormData(prev => ({ ...prev, answer: e.target.value }))}
              rows={4}
              placeholder="输入参考答案..."
              className={classNames(
                "w-full resize-none rounded-lg px-3 py-2 text-sm outline-none transition-all",
                "border-line-1 bg-surface border",
                "text-ink-1 placeholder:text-ink-3",
                "focus:ring-accent/20 focus:border-accent focus:ring-1"
              )}
            />
          </div>
        );
      }
      case "cloze": {
        return (
          <div className="py-2">
            <p className="text-ink-2 text-xs">
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
    <div className="border-line-1 space-y-4 border-t pt-3">
      {renderForm()}

      {/* 解析 */}
      <div>
        <p className="text-ink-2 mb-2 text-xs font-medium">解析（可选）：</p>
        <textarea
          value={formData.explanation}
          onChange={e => setFormData(prev => ({ ...prev, explanation: e.target.value }))}
          rows={2}
          placeholder="输入题目解析..."
          className={classNames(
            "w-full resize-none rounded-lg px-3 py-2 text-sm outline-none transition-all",
            "border-line-1 bg-surface border",
            "text-ink-1 placeholder:text-ink-3",
            "focus:ring-accent/20 focus:border-accent focus:ring-1"
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
            "bg-group text-ink-2",
            "hover:bg-hover"
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
            "bg-accent hover:bg-accent-hover text-white",
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
