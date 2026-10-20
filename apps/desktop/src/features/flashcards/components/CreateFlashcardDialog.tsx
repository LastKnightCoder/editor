import type { Flashcard, FlashcardReferenceInput } from "@/types";
import type { Descendant } from "slate";
import { useFlashcardDecks, useFlashcardMutations } from "../queries";
import { CardEditorDialog } from "./CardEditorDialog";
import { assertFlashcardScope, scopedFlashcardCommands } from "@/services/flashcard-creation";
import type { CommandScope } from "@/services/command-context";

export default function CreateFlashcardDialog({
  open,
  activeDeckId,
  onClose,
  initialReferences,
  initialPrompt,
  onCreated,
  scope,
}: {
  open: boolean;
  activeDeckId: number | null;
  onClose(): void;
  initialReferences?: FlashcardReferenceInput[];
  initialPrompt?: Descendant[];
  onCreated?(card: Flashcard): void;
  scope?: CommandScope;
}) {
  const { decks } = useFlashcardDecks(open);
  const mutations = useFlashcardMutations();
  return (
    <CardEditorDialog
      open={open}
      card={null}
      decks={decks}
      defaultDeckId={activeDeckId}
      now={Date.now()}
      mutations={
        scope
          ? {
              ...mutations,
              async createCard(input) {
                assertFlashcardScope(scope);
                const card = await scopedFlashcardCommands(scope).createFlashcard(input);
                void mutations.refresh();
                return card;
              },
            }
          : mutations
      }
      onClose={onClose}
      onDelete={() => undefined}
      initialReferences={initialReferences}
      initialPrompt={initialPrompt}
      onCreated={onCreated}
    />
  );
}
