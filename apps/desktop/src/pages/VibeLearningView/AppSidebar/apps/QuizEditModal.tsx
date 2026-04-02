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
import { App } from "antd";

import CustomModal from "@/components/CustomModal";
import useVLQuizStore from "@/stores/useVLQuizStore";
import type { VLQuizSet, VLQuizItem, UpdateVLQuizItemInput } from "@/types";
import type { FlashcardOption } from "@/types/flashcard";
import { FLASHCARD_TYPE_META, extractPlainText } from "@/utils/flashcard";

interface QuizEditModalProps {
  open: boolean;
  quizSet: VLQuizSet | null;
  onClose: () => void;
}

const QuizEditModal = memo((props: QuizEditModalProps) => {
  const { open, quizSet, onClose } = props;
  const { message, modal } = App.useApp();

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
      message.success("名称已更新");
      setIsEditingName(false);
    } catch (error) {
      message.error("更新失败");
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
  const handleDeleteItem = useMemoizedFn((item: VLQuizItem) => {
    modal.confirm({
      title: "删除题目",
      content: "确定要删除这道题目吗？此操作无法撤销。",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteItem(item.id);
          message.success("题目已删除");
          // 刷新测验集列表以更新题目数量
          if (currentProjectId) {
            fetchQuizSets(currentProjectId);
          }
        } catch (error) {
          message.error("删除失败");
        }
      },
    });
  });

  // 展开/收起题目
  const handleToggleExpand = useMemoizedFn((itemId: number) => {
    setExpandedItemId((prev) => (prev === itemId ? null : itemId));
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
    return (
      FLASHCARD_TYPE_META[type as keyof typeof FLASHCARD_TYPE_META]?.label ||
      type
    );
  };

  // 难度显示
  const difficultyLabels: Record<string, string> = {
    foundation: "基础",
    standard: "标准",
    advanced: "进阶",
  };

  const difficultyColors: Record<string, string> = {
    foundation:
      "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400",
    standard:
      "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
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
      icon={<Pencil className="w-5 h-5 text-blue-500" />}
      iconBgColor="bg-blue-50 dark:bg-blue-500/20 border-blue-200 dark:border-blue-500/30"
      footer={null}
    >
      <div className="space-y-6">
        {/* 测验名称编辑 */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 block mb-2">
            测验名称
          </label>
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={quizName}
                onChange={(e) => setQuizName(e.target.value)}
                autoFocus
                className={classNames(
                  "flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all",
                  "bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-gray-700",
                  "text-gray-800 dark:text-white",
                  "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") handleCancelEditName();
                }}
              />
              <button
                type="button"
                onClick={handleSaveName}
                disabled={savingName || !quizName.trim()}
                className={classNames(
                  "p-2.5 rounded-lg transition-all",
                  "bg-blue-500 text-white hover:bg-blue-600",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {savingName ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                onClick={handleCancelEditName}
                className="p-2.5 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => setIsEditingName(true)}
              className={classNames(
                "flex items-center justify-between px-4 py-2.5 rounded-xl cursor-pointer transition-all",
                "bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-gray-700",
                "hover:border-blue-400 dark:hover:border-blue-500",
              )}
            >
              <span className="text-sm text-gray-800 dark:text-white">
                {quizSet?.name || "未命名"}
              </span>
              <Pencil className="w-4 h-4 text-gray-400" />
            </div>
          )}
        </div>

        {/* 题目列表 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              题目列表
            </label>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              共 {items.length} 题
            </span>
          </div>

          {loadingItems ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                加载题目中...
              </p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
              <AlertCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                暂无题目
              </p>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-zinc-800/50">
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
        "border-b border-gray-100 dark:border-gray-700/50 last:border-b-0",
        "transition-all",
      )}
    >
      {/* 题目头部 */}
      <div
        className={classNames(
          "flex items-start gap-3 px-4 py-3 cursor-pointer transition-all",
          "hover:bg-gray-100 dark:hover:bg-zinc-700/50",
          isExpanded && "bg-gray-100 dark:bg-zinc-700/50",
        )}
        onClick={onToggleExpand}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
              #{index + 1}
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
              {getTypeLabel(item.type)}
            </span>
            <span
              className={classNames(
                "px-2 py-0.5 rounded-md text-[10px] font-semibold",
                difficultyColors[item.difficulty] ||
                  "bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-400",
              )}
            >
              {difficultyLabels[item.difficulty] || item.difficulty}
            </span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-200 m-0 line-clamp-2 leading-relaxed">
            {promptPreview}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all"
            title="编辑"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
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
                <QuizItemEditForm
                  item={item}
                  onSave={updateItem}
                  onCancel={onCloseEdit}
                />
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
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              选项：
            </p>
            {options.map((opt, idx) => (
              <div
                key={opt.id}
                className={classNames(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                  opt.isCorrect
                    ? "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/30"
                    : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400",
                )}
              >
                <span className="font-medium">
                  {String.fromCharCode(65 + idx)}.
                </span>
                <span className="flex-1">{opt.label}</span>
                {opt.isCorrect && <Check className="w-4 h-4 text-green-500" />}
              </div>
            ))}
          </div>
        );
      }
      case "boolean": {
        const answer = item.data.booleanAnswer;
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              正确答案：
            </span>
            <span
              className={classNames(
                "px-3 py-1 rounded-lg text-sm font-medium",
                answer
                  ? "bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400"
                  : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
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
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              参考答案：
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-100 dark:bg-zinc-800 rounded-lg px-3 py-2">
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
    <div className="pt-2 border-t border-gray-100 dark:border-gray-700/50">
      {renderContent()}
      {item.data.explanation && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            解析：
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {item.data.explanation}
          </p>
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
  const { message } = App.useApp();

  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(() => ({
    options: item.data.options
      ? [...item.data.options.map((o) => ({ ...o }))]
      : [],
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
        if (formData.options.some((opt) => !opt.label.trim())) {
          message.error("请填写所有选项内容");
          setSaving(false);
          return;
        }
        if (!formData.options.some((opt) => opt.isCorrect)) {
          message.error("请至少选择一个正确答案");
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
      message.success("保存成功");
      onCancel();
    } catch (error) {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  }, [item, formData, onSave, onCancel, message]);

  // 更新选项
  const updateOption = useCallback(
    (index: number, updates: Partial<FlashcardOption>) => {
      setFormData((prev) => ({
        ...prev,
        options: prev.options.map((opt, i) =>
          i === index ? { ...opt, ...updates } : opt,
        ),
      }));
    },
    [],
  );

  // 设置正确答案（单选）
  const setCorrectOption = useCallback(
    (index: number) => {
      if (item.type === "single-choice") {
        setFormData((prev) => ({
          ...prev,
          options: prev.options.map((opt, i) => ({
            ...opt,
            isCorrect: i === index,
          })),
        }));
      }
    },
    [item.type],
  );

  // 切换正确答案（多选）
  const toggleCorrectOption = useCallback(
    (index: number) => {
      if (item.type === "multiple-choice") {
        setFormData((prev) => ({
          ...prev,
          options: prev.options.map((opt, i) =>
            i === index ? { ...opt, isCorrect: !opt.isCorrect } : opt,
          ),
        }));
      }
    },
    [item.type],
  );

  // 添加选项
  const addOption = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      options: [
        ...prev.options,
        { id: crypto.randomUUID(), label: "", isCorrect: false },
      ],
    }));
  }, []);

  // 删除选项
  const removeOption = useCallback((index: number) => {
    setFormData((prev) => ({
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
                  onClick={() =>
                    isMultiple
                      ? toggleCorrectOption(idx)
                      : setCorrectOption(idx)
                  }
                  className={classNames(
                    "shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                    opt.isCorrect
                      ? "bg-green-500 border-green-500 text-white"
                      : "border-gray-300 dark:border-gray-600 hover:border-green-400",
                  )}
                >
                  {opt.isCorrect && <Check className="w-3 h-3" />}
                </button>
                <input
                  type="text"
                  value={opt.label}
                  onChange={(e) => updateOption(idx, { label: e.target.value })}
                  placeholder={`选项 ${String.fromCharCode(65 + idx)}`}
                  className={classNames(
                    "flex-1 px-3 py-2 rounded-lg text-sm outline-none transition-all",
                    "bg-white dark:bg-zinc-800 border border-gray-200 dark:border-gray-700",
                    "text-gray-800 dark:text-white",
                    "focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20",
                  )}
                />
                {formData.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addOption}
              className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              添加选项
            </button>
          </div>
        );
      }
      case "boolean": {
        return (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              正确答案：
            </p>
            <div className="flex gap-3">
              {[
                { value: true, label: "正确" },
                { value: false, label: "错误" },
              ].map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      booleanAnswer: opt.value,
                    }))
                  }
                  className={classNames(
                    "flex-1 py-3 rounded-lg font-medium transition-all border-2",
                    formData.booleanAnswer === opt.value
                      ? opt.value
                        ? "bg-green-50 dark:bg-green-500/10 border-green-500 text-green-600 dark:text-green-400"
                        : "bg-red-50 dark:bg-red-500/10 border-red-500 text-red-600 dark:text-red-400"
                      : "bg-gray-50 dark:bg-zinc-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300",
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
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              参考答案：
            </p>
            <textarea
              value={formData.answer}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, answer: e.target.value }))
              }
              rows={4}
              placeholder="输入参考答案..."
              className={classNames(
                "w-full px-3 py-2 rounded-lg text-sm outline-none transition-all resize-none",
                "bg-white dark:bg-zinc-800 border border-gray-200 dark:border-gray-700",
                "text-gray-800 dark:text-white placeholder:text-gray-400",
                "focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20",
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
    <div className="pt-3 border-t border-gray-100 dark:border-gray-700/50 space-y-4">
      {renderForm()}

      {/* 解析 */}
      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
          解析（可选）：
        </p>
        <textarea
          value={formData.explanation}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, explanation: e.target.value }))
          }
          rows={2}
          placeholder="输入题目解析..."
          className={classNames(
            "w-full px-3 py-2 rounded-lg text-sm outline-none transition-all resize-none",
            "bg-white dark:bg-zinc-800 border border-gray-200 dark:border-gray-700",
            "text-gray-800 dark:text-white placeholder:text-gray-400",
            "focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20",
          )}
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className={classNames(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all",
            "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400",
            "hover:bg-gray-200 dark:hover:bg-zinc-700",
          )}
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={classNames(
            "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            "bg-blue-500 text-white hover:bg-blue-600",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          保存
        </button>
      </div>
    </div>
  );
});

QuizItemEditForm.displayName = "QuizItemEditForm";

export default QuizEditModal;
