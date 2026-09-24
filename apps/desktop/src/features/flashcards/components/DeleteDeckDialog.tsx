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
  return (
    <ConfirmDialog
      open={deck !== null}
      onOpenChange={next => !next && onClose()}
      title="删除卡组"
      context={deck?.name}
      description="卡组里的闪卡会一起删除，无法撤销。"
      impact={`将删除 ${cardCount} 张闪卡及其全部复习记录`}
      confirmText="删除"
      danger
      onConfirm={async () => {
        if (!deck) return;
        try {
          await mutations.deleteDeck(deck.id);
          toast.success(`已删除卡组「${deck.name}」`);
          onDeleted(deck);
        } catch {
          toast.error("删除失败");
        }
        onClose();
      }}
    />
  );
}
