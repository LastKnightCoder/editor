import type { FlashcardReferenceInput } from "@/types";
import { useFlashcardDecks, useFlashcardMutations } from "../queries";
import { CardEditorDialog } from "./CardEditorDialog";

export default function CreateFlashcardDialog({
  open,
  activeDeckId,
  onClose,
  initialReferences,
}: {
  open: boolean;
  activeDeckId: number | null;
  onClose(): void;
  initialReferences?: FlashcardReferenceInput[];
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
      mutations={mutations}
      onClose={onClose}
      onDelete={() => undefined}
      initialReferences={initialReferences}
    />
  );
}
