import {
  flashcardsTranslator,
  flashcardsCount,
  flashcardsErrorText,
  useFlashcardsI18n,
  type FlashcardsMessageKey,
} from "../i18n";
import { TYPE_META } from "../model";
import { useMemo } from "react";
import { Sparkles, CreditCard, Check, Edit2 } from "lucide-react";
import type { TagColor } from "@tau/ui";
import { Button, Checkbox, Dialog, DialogBody, Spinner, Tag } from "@tau/ui";
import DeckIcon from "@tau/shared/deck-icon";
import { extractPlainText } from "@/utils/flashcard";
import type { GeneratedFlashcard } from "../hooks/useFlashcardGeneration";
import type { FlashcardDeck } from "@/types";

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
  isSaving?: boolean;
}

const difficultyLabels: Record<string, { message: FlashcardsMessageKey; color: TagColor }> = {
  foundation: { message: "ui.foundation", color: "green" },
  standard: { message: "ui.standard", color: "blue" },
  advanced: { message: "ui.advanced", color: "orange" },
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
  isSaving = false,
}: FlashcardGenerationModalProps) => {
  useFlashcardsI18n();
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
      return card.data.booleanAnswer
        ? flashcardsTranslator.t("ui.true")
        : flashcardsTranslator.t("ui.false");
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
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onCancel();
      }}
      title={flashcardsTranslator.t("ui.generateFlashcardsWithAI")}
      icon={<Sparkles />}
      subtitle={flashcardsTranslator.t("ui.generateReviewFlashcardsFromCardContent")}
      width={900}
      locked={isSaving}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
            {flashcardsTranslator.t("ui.cancel")}
          </Button>
          <Button
            variant="primary"
            icon={Check}
            onClick={onConfirm}
            loading={isSaving}
            disabled={isGenerating || isSaving || selectedCount === 0 || !selectedDeck}
          >
            {flashcardsCount("creation.addCards", selectedCount)}
          </Button>
        </>
      }
    >
      <DialogBody>
        {/* Deck Selection Header */}
        <div className="border-line-1 rounded-tau-md mb-4 flex items-center justify-between border p-3">
          <div className="text-ink-1 flex items-center gap-2">
            <DeckIcon emoji={selectedDeck?.emoji} className="text-ink-2 size-[18px] text-lg" />
            <span className="text-tau-body font-medium">
              {selectedDeck?.name || flashcardsTranslator.t("ui.noDeckSelected")}
            </span>
          </div>
          <button
            onClick={onChangeDeck}
            className="text-accent hover:text-accent-hover text-tau-sm transition-colors"
          >
            {flashcardsTranslator.t("ui.changeDeck")}
          </button>
        </div>

        {/* Status Display */}
        {isGenerating && (
          <div className="bg-accent-soft text-accent rounded-tau-md text-tau-body mb-4 flex items-center gap-2 p-4">
            <Spinner className="size-4" />
            <span>
              {isPending
                ? flashcardsTranslator.t("ui.waitingForTheModel")
                : flashcardsTranslator.t("ui.generatingFlashcards")}
            </span>
          </div>
        )}

        {error && (
          <div className="bg-danger-soft text-danger rounded-tau-md mb-4 p-4">
            <p className="text-tau-body">
              {flashcardsTranslator.t("creation.failed", { reason: flashcardsErrorText(error) })}
            </p>
          </div>
        )}

        {/* Cards List */}
        {generatedCards.length > 0 && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-ink-3 text-tau-body tabular-nums">
                {flashcardsTranslator.t("creation.selection", {
                  generated: generatedCards.length,
                  selected: selectedCount,
                })}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={onSelectAll}
                  className="text-accent hover:bg-accent-soft text-tau-sm rounded px-2 py-1 transition-colors"
                >
                  {flashcardsTranslator.t("ui.selectAll")}
                </button>
                <button
                  onClick={onDeselectAll}
                  className="text-ink-3 hover:bg-hover hover:text-ink-2 text-tau-sm rounded px-2 py-1 transition-colors"
                >
                  {flashcardsTranslator.t("ui.deselectAll")}
                </button>
              </div>
            </div>

            <div className="max-h-[400px] space-y-3 overflow-y-auto pr-2">
              {generatedCards.map(card => (
                <div
                  key={card.id}
                  className={`rounded-tau-md ease-tau-out border-[1.5px] p-4 transition-colors ${
                    card.selected
                      ? "border-accent bg-accent-soft"
                      : "border-line-1 hover:border-ink-3/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="pt-0.5">
                      <Checkbox checked={card.selected} onChange={() => onToggleCard(card.id)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Tag>{flashcardsTranslator.t(TYPE_META[card.type].labelKey)}</Tag>
                        <Tag color={difficultyLabels[card.difficulty]?.color}>
                          {flashcardsTranslator.t(difficultyLabels[card.difficulty].message)}
                        </Tag>
                        {card.tags.length > 0 && (
                          <div className="flex gap-1">
                            {card.tags.slice(0, 2).map(tag => (
                              <Tag key={tag}>{tag}</Tag>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-ink-1 text-tau-body line-clamp-2">{getPromptText(card)}</p>
                      {getAnswerPreview(card) && (
                        <p className="text-ink-3 text-tau-sm mt-1 line-clamp-1">
                          {flashcardsTranslator.t("creation.answer", {
                            answer: getAnswerPreview(card) ?? "",
                          })}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => onEditCard(card)}
                      className="text-ink-3 hover:bg-hover hover:text-ink-2 rounded-tau-sm p-2 transition-colors"
                      title={flashcardsTranslator.t("ui.editFlashcard")}
                    >
                      <Edit2 className="size-4" strokeWidth={1.75} />
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
            <CreditCard className="text-ink-3 mx-auto mb-3 size-12 opacity-40" strokeWidth={1.75} />
            <p className="text-ink-3 text-tau-body">
              {flashcardsTranslator.t("ui.waitingForFlashcards")}
            </p>
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
};

export default FlashcardGenerationModal;
