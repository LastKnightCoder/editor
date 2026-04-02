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
    color:
      "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400",
  },
  standard: {
    label: "常规",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
  },
  advanced: {
    label: "进阶",
    color:
      "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400",
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
    () => generatedCards.filter((c) => c.selected).length,
    [generatedCards],
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
    if (
      (card.type === "single-choice" || card.type === "multiple-choice") &&
      card.data?.options
    ) {
      const correct = card.data.options
        .filter((opt) => opt.isCorrect)
        .map((opt) => opt.label);
      return correct.join(", ");
    }
    if (card.type === "cloze" && card.data?.blanks) {
      return card.data.blanks.map((b) => b.answer).join(", ");
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
      icon={
        <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
      }
      iconBgColor="bg-purple-50 dark:bg-purple-500/20 border-purple-200 dark:border-purple-500/30"
      bodyClassName="flashcard-generation-modal-body"
    >
      {/* Deck Selection Header */}
      <div className="flex items-center justify-between mb-4 p-3 rounded-lg bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">{selectedDeck?.emoji || "📚"}</span>
          <span className="font-medium text-gray-700 dark:text-slate-200">
            {selectedDeck?.name || "未选择卡组"}
          </span>
        </div>
        <button
          onClick={onChangeDeck}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          更换卡组
        </button>
      </div>

      {/* Status Display */}
      {isGenerating && (
        <div className="mb-4 p-4 rounded-lg bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30">
          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
            <LoadingOutlined className="text-lg" />
            <span>{isPending ? "等待模型输出..." : "正在生成闪卡..."}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30">
          <p className="text-red-700 dark:text-red-400">
            生成失败: {error.message}
          </p>
        </div>
      )}

      {/* Cards List */}
      {generatedCards.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-600 dark:text-slate-400">
              已生成 {generatedCards.length} 张闪卡，已选择 {selectedCount} 张
            </span>
            <div className="flex gap-2">
              <button
                onClick={onSelectAll}
                className="text-xs px-2 py-1 rounded text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
              >
                全选
              </button>
              <button
                onClick={onDeselectAll}
                className="text-xs px-2 py-1 rounded text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-zinc-700"
              >
                取消全选
              </button>
            </div>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-auto pr-2">
            {generatedCards.map((card) => (
              <div
                key={card.id}
                className={`p-4 rounded-xl border transition-all ${
                  card.selected
                    ? "border-indigo-300 dark:border-indigo-500/50 bg-indigo-50/50 dark:bg-indigo-500/10"
                    : "border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="pt-0.5 cursor-pointer"
                    onClick={() => onToggleCard(card.id)}
                  >
                    <CustomCheckbox
                      checked={card.selected}
                      onChange={() => onToggleCard(card.id)}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-slate-300">
                        {FLASHCARD_TYPE_META[card.type]?.label || card.type}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${difficultyLabels[card.difficulty]?.color || ""}`}
                      >
                        {difficultyLabels[card.difficulty]?.label ||
                          card.difficulty}
                      </span>
                      {card.tags.length > 0 && (
                        <div className="flex gap-1">
                          {card.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-slate-400"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 dark:text-white line-clamp-2">
                      {getPromptText(card)}
                    </p>
                    {getAnswerPreview(card) && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400 line-clamp-1">
                        答案: {getAnswerPreview(card)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onEditCard(card)}
                    className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400 transition-colors"
                    title="编辑闪卡"
                  >
                    <Edit2 className="w-4 h-4" />
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
          <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-slate-600" />
          <p className="text-gray-500 dark:text-slate-400">等待生成闪卡...</p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-gray-200 dark:border-slate-700">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-slate-200 hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
        >
          取消
        </button>
        <button
          onClick={onConfirm}
          disabled={isGenerating || selectedCount === 0 || !selectedDeck}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Check className="w-4 h-4" />
          添加 {selectedCount} 张闪卡
        </button>
      </div>
    </CustomModal>
  );
};

export default FlashcardGenerationModal;
