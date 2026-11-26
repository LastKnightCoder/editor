import { flashcardsTranslator, flashcardsCount, useFlashcardsI18n } from "../i18n";
import type { FlashcardDeck } from "@/types";
import { ConfirmDialog, toast } from "@tau/ui";
import type { FlashcardMutations } from "../queries";

export function DeleteDeckDialog({
  deck,
  cardCount,
  mutations,
  onClose,
  onDeleted,
}: {
  deck: FlashcardDeck | null;
  cardCount: number;
  mutations: FlashcardMutations;
  onClose(): void;
  onDeleted(deck: FlashcardDeck): void;
}) {
  useFlashcardsI18n();
  return (
    <ConfirmDialog
      open={deck !== null}
      onOpenChange={next => !next && onClose()}
      title={flashcardsTranslator.t("ui.deleteDeck")}
      context={deck?.name}
      description={flashcardsTranslator.t("ui.flashcardsInThisDeckWillAlsoBePermanentlyDeleted")}
      impact={flashcardsCount("deck.deleteCards", cardCount)}
      confirmText={flashcardsTranslator.t("ui.delete")}
      danger
      onConfirm={async () => {
        if (!deck) return;
        try {
          await mutations.deleteDeck(deck.id);
          toast.success(flashcardsTranslator.t("deck.deleted", { name: deck.name }));
          onDeleted(deck);
        } catch {
          toast.error(flashcardsTranslator.t("ui.couldNotDelete"));
        }
        onClose();
      }}
    />
  );
}
