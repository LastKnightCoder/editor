import { memo, useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { Pencil, Trash2, Check, X, ChevronDown, Plus, Save, CircleAlert } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
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

import useVLQuizStore from "@/stores/useVLQuizStore";
import type { VLQuizSet, VLQuizItem, UpdateVLQuizItemInput } from "@/types";
import type { FlashcardOption } from "@/types/flashcard";
import { FLASHCARD_TYPE_META, extractPlainText } from "@/utils/flashcard";

interface QuizEditModalProps {
  open: boolean;
  quizSet: VLQuizSet | null;
  onClose: () => void;
}

// 难度显示
const DIFFICULTY_LABELS: Record<string, string> = {
  foundation: "基础",
  standard: "标准",
  advanced: "进阶",
};

const DIFFICULTY_COLORS: Record<string, TagColor> = {
  foundation: "green",
  standard: "yellow",
  advanced: "red",
};

// 题型显示名称
const getTypeLabel = (type: string) => {
  return FLASHCARD_TYPE_META[type as keyof typeof FLASHCARD_TYPE_META]?.label || type;
};

/** 字段标签：12px 淡墨，放在内容上方 */
function FieldLabel({ children, extra }: { children: string; extra?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="text-ink-2 text-[12px]">{children}</span>
      <span className="flex-1" />
      {extra}
    </div>
  );
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

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && handleClose()}
      title="编辑测验"
      subtitle="修改测验信息和题目内容"
      icon={<Pencil className="size-4" strokeWidth={1.75} />}
      width={700}
    >
      <div className="flex flex-col gap-5 pt-1">
        {/* 测验名称编辑 */}
        <div>
          <FieldLabel>测验名称</FieldLabel>
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
                保存
              </Button>
              <IconButton aria-label="取消" title="取消" onClick={handleCancelEditName}>
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
              <span className="text-ink-1 text-tau-body truncate">{quizSet?.name || "未命名"}</span>
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
            extra={<span className="text-ink-3 text-tau-meta">共 {items.length} 题</span>}
          >
            题目列表
          </FieldLabel>

          {loadingItems ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Spinner className="size-5" />
              <p className="text-ink-3 text-tau-meta m-0">加载题目中...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="border-line-1 rounded-tau-md flex flex-col items-center justify-center gap-2 border border-dashed py-12">
              <CircleAlert className="text-ink-3 size-6" strokeWidth={1.75} />
              <p className="text-ink-3 text-tau-meta m-0">暂无题目</p>
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

  // 获取题干预览文本
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
            aria-label="编辑"
            title="编辑"
            onClick={e => {
              e.stopPropagation();
              onStartEdit();
            }}
          >
            <Pencil className="size-4" strokeWidth={1.75} />
          </IconButton>
          <IconButton
            aria-label="删除"
            title="删除"
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
        <div className="px-3 pb-3 pt-1">
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
  const { item } = props;

  const renderContent = () => {
    switch (item.type) {
      case "single-choice":
      case "multiple-choice": {
        const options = item.data.options || [];
        return (
          <div>
            <FieldLabel>选项</FieldLabel>
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
            <span className="text-ink-2 text-[12px]">正确答案</span>
            <Tag color={answer ? "green" : "red"}>{answer ? "正确" : "错误"}</Tag>
          </div>
        );
      }
      case "qa": {
        return (
          <div>
            <FieldLabel>参考答案</FieldLabel>
            <p className="border-line-1 rounded-tau-sm text-ink-2 text-tau-body m-0 whitespace-pre-wrap border px-3 py-2">
              {item.data.answer || "暂无答案"}
            </p>
          </div>
        );
      }
      case "cloze": {
        return <p className="text-ink-3 text-tau-meta m-0">填空题（答案已在题干中标记）</p>;
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
          <FieldLabel>解析</FieldLabel>
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
          <div>
            <FieldLabel>
              {isMultiple ? "选项（勾选正确答案，可多选）" : "选项（选中正确答案）"}
            </FieldLabel>
            <div className="flex flex-col gap-1.5">
              {formData.options.map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-1.5">
                  {isMultiple ? (
                    <Checkbox
                      aria-label="设为正确答案"
                      checked={!!opt.isCorrect}
                      onChange={() => toggleCorrectOption(idx)}
                    />
                  ) : (
                    <Radio
                      aria-label="设为正确答案"
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
                    placeholder={`选项 ${String.fromCharCode(65 + idx)}`}
                    wrapperClassName="flex-1"
                  />
                  {formData.options.length > 2 && (
                    <IconButton
                      aria-label="删除选项"
                      title="删除选项"
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
              添加选项
            </Button>
          </div>
        );
      }
      case "boolean": {
        return (
          <div>
            <FieldLabel>正确答案</FieldLabel>
            <Segmented
              label="正确答案"
              value={formData.booleanAnswer ? "true" : "false"}
              onValueChange={v =>
                setFormData(prev => ({
                  ...prev,
                  booleanAnswer: v === "true",
                }))
              }
            >
              <Segmented.Item value="true" label="正确" icon={Check} />
              <Segmented.Item value="false" label="错误" icon={X} />
            </Segmented>
          </div>
        );
      }
      case "qa": {
        return (
          <div>
            <FieldLabel>参考答案</FieldLabel>
            <Textarea
              value={formData.answer}
              onChange={e => setFormData(prev => ({ ...prev, answer: e.target.value }))}
              rows={4}
              placeholder="输入参考答案..."
            />
          </div>
        );
      }
      case "cloze": {
        return (
          <p className="text-ink-3 text-tau-meta m-0">
            填空题的答案在题干中编辑，此处暂不支持修改填空内容。
          </p>
        );
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
        <FieldLabel>解析（可选）</FieldLabel>
        <Textarea
          value={formData.explanation}
          onChange={e => setFormData(prev => ({ ...prev, explanation: e.target.value }))}
          rows={2}
          placeholder="输入题目解析..."
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
          取消
        </Button>
        <Button variant="primary" size="sm" icon={Save} loading={saving} onClick={handleSave}>
          保存
        </Button>
      </div>
    </div>
  );
});

QuizItemEditForm.displayName = "QuizItemEditForm";

export default QuizEditModal;
