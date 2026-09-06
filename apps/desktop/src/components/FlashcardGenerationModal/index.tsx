import { useMemo } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { Sparkles, CreditCard, Check, Edit2 } from "lucide-react";
import CustomModal from "@/components/CustomModal";
import CustomCheckbox from "@/components/CustomCheckbox";
import { FLASHCARD_TYPE_META, extractPlainText } from "@/utils/flashcard";
import type { GeneratedFlashcard } from "@/hooks/useFlashcardGeneration";
import type { FlashcardDeck } from "@/types";
import "./index.css";

interface FlashcardGenerationModalProps {
  open: boolean;
  onCancel: () => void;
  isGenerating: boolean;
  isPending: boolean;
  error: Error | null;
  generatedCards: GeneratedFlashcard[];
  selectedDeck: FlashcardDeck | null;
  onToggleCard: (cardId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onConfirm: () => void;
  onChangeDeck: () => void;
  onEditCard: (card: GeneratedFlashcard) => void;
}

const difficultyLabels: Record<string, { label: string; color: string }> = {
  foundation: {
    label: "基础",
    color: "bg-[var(--th-success)]/15 text-status-success",
  },
  standard: {
    label: "常规",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
  },
  advanced: {
    label: "进阶",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400",
  },
};

const FlashcardGenerationModal = ({
  open,
  onCancel,
  isGenerating,
  isPending,
  error,
  generatedCards,
  selectedDeck,
  onToggleCard,
  onSelectAll,
  onDeselectAll,
  onConfirm,
  onChangeDeck,
  onEditCard,
}: FlashcardGenerationModalProps) => {
  const selectedCount = useMemo(
    () => generatedCards.filter(c => c.selected).length,
    [generatedCards]
  );

  const getPromptText = (card: GeneratedFlashcard): string => {
    const text = extractPlainText(card.prompt);
    // For cloze, show with blanks
    if (card.type === "cloze") {
      return text.replace(/\{\{blank:[^}]+\}\}/g, "____");
    }
    return text;
  };

  const getAnswerPreview = (card: GeneratedFlashcard): string | null => {
    if (card.type === "qa" && card.data?.answer) {
      return card.data.answer;
    }
    if (card.type === "boolean" && card.data?.booleanAnswer !== undefined) {
      return card.data.booleanAnswer ? "正确" : "错误";
    }
    if ((card.type === "single-choice" || card.type === "multiple-choice") && card.data?.options) {
      const correct = card.data.options.filter(opt => opt.isCorrect).map(opt => opt.label);
      return correct.join(", ");
    }
    if (card.type === "cloze" && card.data?.blanks) {
      return card.data.blanks.map(b => b.answer).join(", ");
    }
    return null;
  };

  return (
    <CustomModal
      open={open}
      onCancel={onCancel}
      width="900px"
      centered
      footer={null}
      title="AI 生成闪卡"
      subtitle="基于卡片内容智能生成复习卡片"
      icon={<Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />}
      iconBgColor="bg-purple-50 dark:bg-purple-500/20 border-purple-200 dark:border-purple-500/30"
      bodyClassName="flashcard-generation-modal-body"
    >
      {/* Deck Selection Header */}
      <div className="mb-4 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-zinc-800/50">
        <div className="flex items-center gap-2">
          <span className="text-lg">{selectedDeck?.emoji || "📚"}</span>
          <span className="font-medium text-gray-700 dark:text-slate-200">
            {selectedDeck?.name || "未选择卡组"}
          </span>
        </div>
        <button
          onClick={onChangeDeck}
          className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
        >
          更换卡组
        </button>
      </div>

      {/* Status Display */}
      {isGenerating && (
        <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-500/30 dark:bg-purple-500/10">
          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
            <LoadingOutlined className="text-lg" />
            <span>{isPending ? "等待模型输出..." : "正在生成闪卡..."}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
          <p className="text-red-700 dark:text-red-400">生成失败: {error.message}</p>
        </div>
      )}

      {/* Cards List */}
      {generatedCards.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-slate-400">
              已生成 {generatedCards.length} 张闪卡，已选择 {selectedCount} 张
            </span>
            <div className="flex gap-2">
              <button
                onClick={onSelectAll}
                className="rounded px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
              >
                全选
              </button>
              <button
                onClick={onDeselectAll}
                className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-zinc-700"
              >
                取消全选
              </button>
            </div>
          </div>

          <div className="max-h-[400px] space-y-3 overflow-auto pr-2">
            {generatedCards.map(card => (
              <div
                key={card.id}
                className={`rounded-xl border p-4 transition-all ${
                  card.selected
                    ? "border-indigo-300 bg-indigo-50/50 dark:border-indigo-500/50 dark:bg-indigo-500/10"
                    : "border-gray-200 hover:border-gray-300 dark:border-slate-700 dark:hover:border-slate-600"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="cursor-pointer pt-0.5" onClick={() => onToggleCard(card.id)}>
                    <CustomCheckbox
                      checked={card.selected}
                      onChange={() => onToggleCard(card.id)}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-zinc-700 dark:text-slate-300">
                        {FLASHCARD_TYPE_META[card.type]?.label || card.type}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${difficultyLabels[card.difficulty]?.color || ""}`}
                      >
                        {difficultyLabels[card.difficulty]?.label || card.difficulty}
                      </span>
                      {card.tags.length > 0 && (
                        <div className="flex gap-1">
                          {card.tags.slice(0, 2).map(tag => (
                            <span
                              key={tag}
                              className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-zinc-700 dark:text-slate-400"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="line-clamp-2 text-sm text-gray-800 dark:text-white">
                      {getPromptText(card)}
                    </p>
                    {getAnswerPreview(card) && (
                      <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-slate-400">
                        答案: {getAnswerPreview(card)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onEditCard(card)}
                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400"
                    title="编辑闪卡"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty State */}
      {!isGenerating && !error && generatedCards.length === 0 && (
        <div className="py-12 text-center">
          <CreditCard className="mx-auto mb-3 h-12 w-12 text-gray-300 dark:text-slate-600" />
          <p className="text-gray-500 dark:text-slate-400">等待生成闪卡...</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-slate-700">
        <button
          onClick={onCancel}
          className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-zinc-700 dark:text-slate-200 dark:hover:bg-slate-600"
        >
          取消
        </button>
        <button
          onClick={onConfirm}
          disabled={isGenerating || selectedCount === 0 || !selectedDeck}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          添加 {selectedCount} 张闪卡
        </button>
      </div>
    </CustomModal>
  );
};

export default FlashcardGenerationModal;
