import { flashcardsTranslator, flashcardsErrorText, useFlashcardsI18n } from "../../i18n";
import { useEffect, useState } from "react";
import { Button, Dialog, DialogBody, Input, Textarea, toast } from "@tau/ui";
import type { FlashcardDeck } from "@/types";
import { useFlashcardMutations } from "../../queries";
import { deckIconKeys, deckIcons } from "@tau/shared/deck-icon";
import { flashcardDeckColors } from "@/utils/flashcard";

interface DeckFormModalProps {
  state: {
    open: boolean;
    mode: "create" | "edit";
    deck?: FlashcardDeck | null;
  };
  onClose: (newDeck?: FlashcardDeck) => void;
}

/** 表单字段标签，口径与 ui/patterns 的 FormField 一致 */
const FIELD_LABEL = "text-ink-1 text-tau-meta font-medium";

const DeckFormModal = ({ state, onClose }: DeckFormModalProps) => {
  useFlashcardsI18n();
  const { createDeck, updateDeck } = useFlashcardMutations();

  const [form, setForm] = useState({
    name: "",
    description: "",
    coverColor: flashcardDeckColors[0],
    emoji: deckIconKeys[0],
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    if (state.mode === "edit" && state.deck) {
      setForm({
        name: state.deck.name,
        description: state.deck.description ?? "",
        coverColor: state.deck.coverColor ?? flashcardDeckColors[0],
        emoji: state.deck.emoji ?? deckIconKeys[0],
      });
    } else {
      setForm({
        name: "",
        description: "",
        coverColor: flashcardDeckColors[0],
        emoji: deckIconKeys[0],
      });
    }
  }, [state]);

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      if (state.mode === "create") {
        const newDeck = await createDeck({
          name: form.name.trim(),
          description: form.description.trim(),
          coverColor: form.coverColor,
          emoji: form.emoji,
        });
        onClose(newDeck);
      } else if (state.deck) {
        await updateDeck({
          id: state.deck.id,
          name: form.name.trim(),
          description: form.description.trim(),
          coverColor: form.coverColor,
          emoji: form.emoji,
        });
        onClose();
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? flashcardsErrorText(error)
          : flashcardsTranslator.t("ui.couldNotSaveDeck")
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={state.open}
      onOpenChange={next => {
        if (!next && !submitting) onClose();
      }}
      title={
        state.mode === "create"
          ? flashcardsTranslator.t("ui.newDeck")
          : flashcardsTranslator.t("ui.editDeck")
      }
      subtitle={flashcardsTranslator.t("ui.setADeckNameCoverAndDescription")}
      width={500}
      locked={submitting}
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose()} disabled={submitting}>
            {flashcardsTranslator.t("ui.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSubmit()}
            disabled={!form.name.trim() || submitting}
          >
            {state.mode === "create"
              ? flashcardsTranslator.t("ui.createDeck")
              : flashcardsTranslator.t("ui.saveChanges")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <form
          className="space-y-5"
          onSubmit={e => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL} htmlFor="deck-form-name">
              {flashcardsTranslator.t("ui.deckName")}
            </label>
            <Input
              id="deck-form-name"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder={flashcardsTranslator.t("ui.forExampleAlgorithmReview")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL}>{flashcardsTranslator.t("ui.description")}</label>
            <Textarea
              value={form.description}
              onChange={e =>
                setForm(prev => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder={flashcardsTranslator.t("ui.addADescriptionOrLearningGoal")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL}>{flashcardsTranslator.t("ui.themeColor")}</label>
            <div className="flex flex-wrap gap-2">
              {flashcardDeckColors.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, coverColor: color }))}
                  style={{ backgroundColor: color }}
                  aria-label={flashcardsTranslator.t("color.theme", { color: color })}
                  aria-pressed={form.coverColor === color}
                  className={`size-10 rounded-full border-2 transition ${
                    form.coverColor === color
                      ? "border-accent"
                      : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={FIELD_LABEL}>{flashcardsTranslator.t("ui.coverIcon")}</label>
            <div className="flex flex-wrap gap-2">
              {deckIconKeys.map(key => {
                const Icon = deckIcons[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, emoji: key }))}
                    aria-pressed={form.emoji === key}
                    className={`ease-tau-out grid size-10 place-items-center rounded-full border-[1.5px] transition-colors ${
                      form.emoji === key
                        ? "border-accent bg-accent-soft text-accent-text"
                        : "border-line-1 text-ink-2 hover:border-ink-3/50"
                    }`}
                  >
                    <Icon className="size-5" strokeWidth={1.75} />
                  </button>
                );
              })}
            </div>
          </div>
        </form>
      </DialogBody>
    </Dialog>
  );
};

export default DeckFormModal;
