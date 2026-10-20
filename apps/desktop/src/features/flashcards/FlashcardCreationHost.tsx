import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Flashcard } from "@/types";
import {
  flashcardCreationRequests,
  assertFlashcardScope,
  type FlashcardCreationRequest,
  scopedFlashcardCommands,
} from "@/services/flashcard-creation";
import { toast } from "@tau/ui";
import { useThemeStore } from "@tau/themes/react";
import useFlashcardCreationSession from "./hooks/useFlashcardCreationSession";
import DeckSelectorDialog from "./components/DeckSelectorDialog";
import CreateFlashcardDialog from "./components/CreateFlashcardDialog";
import FlashcardGenerationDialog from "./components/FlashcardGenerationDialog";
import GeneratedFlashcardEditDialog from "./components/GeneratedFlashcardEditDialog";

export function FlashcardCreationHost() {
  const request = useSyncExternalStore(
    flashcardCreationRequests.subscribe,
    flashcardCreationRequests.getSnapshot
  );
  return request ? <CreationSession key={request.id} request={request} /> : null;
}

function CreationSession({ request }: { request: FlashcardCreationRequest }) {
  const isDark = useThemeStore(state => state.mode === "dark");
  const created = useRef<Flashcard[]>([]);
  const selected = useRef(false);
  const lifecycle = useRef({ revision: 0 });
  const flashcard = useFlashcardCreationSession({
    mode: request.options.mode ?? "manual",
    assertActive: () => assertFlashcardScope(request.scope),
    getContent: () => request.options.content,
    getReferences: () => request.options.references,
    onCreated: card => created.current.push(card),
    onFinish: completed =>
      request.settle({
        status: completed && created.current.length ? "completed" : "cancelled",
        cards: created.current,
      }),
  });
  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        assertFlashcardScope(request.scope);
        if (request.options.deckId !== undefined) {
          const deck = await scopedFlashcardCommands(request.scope).getFlashcardDeck(
            request.options.deckId
          );
          if (!active) return;
          assertFlashcardScope(request.scope);
          if (!deck) throw new Error("卡组不存在");
          flashcard.handleDeckSelect(deck);
        } else {
          if (request.options.mode === "ai") flashcard.openAiFlashcard();
          else flashcard.openManualFlashcard();
        }
      } catch (error) {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "打开制卡窗口失败");
        request.settle({ status: "cancelled", cards: created.current });
      }
    };
    void start();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 请求以独立 key 固定一次会话
  }, [request]);
  useEffect(() => {
    const state = lifecycle.current;
    const revision = ++state.revision;
    const cards = created.current;
    return () => {
      queueMicrotask(() => {
        if (state.revision === revision) request.settle({ status: "cancelled", cards });
      });
    };
  }, [request]);
  const cancelSelector = () => {
    flashcard.closeDeckSelector();
    if (selected.current) {
      selected.current = false;
      return;
    }
    request.settle({ status: "cancelled", cards: created.current });
  };
  return (
    <>
      <DeckSelectorDialog
        open={flashcard.deckSelectorOpen}
        onCancel={cancelSelector}
        onSelect={deck => {
          selected.current = true;
          flashcard.handleDeckSelect(deck);
        }}
        title={request.options.mode === "ai" ? "选择卡组 - AI 制卡" : "选择卡组 - 手动制卡"}
      />
      {flashcard.flashcardEditorOpen && flashcard.selectedDeck && (
        <CreateFlashcardDialog
          open
          activeDeckId={flashcard.selectedDeck.id}
          onClose={flashcard.closeFlashcardEditor}
          initialReferences={request.options.references}
          initialPrompt={request.options.content}
          scope={request.scope}
          onCreated={card => created.current.push(card)}
        />
      )}
      <FlashcardGenerationDialog
        open={flashcard.aiGenerationModalOpen}
        onCancel={flashcard.handleCancelAiGeneration}
        isGenerating={flashcard.isGenerating}
        isPending={flashcard.isGenerationPending}
        error={flashcard.generationError}
        generatedCards={flashcard.generatedCards}
        selectedDeck={flashcard.selectedDeck}
        onToggleCard={flashcard.toggleCardSelection}
        onSelectAll={flashcard.selectAll}
        onDeselectAll={flashcard.deselectAll}
        onConfirm={() => void flashcard.handleConfirmAiGeneration()}
        onChangeDeck={flashcard.changeDeck}
        onEditCard={flashcard.handleEditGeneratedCard}
        isSaving={flashcard.isSaving}
      />
      <GeneratedFlashcardEditDialog
        open={flashcard.generatedCardEditModalOpen}
        card={flashcard.editingGeneratedCard}
        onSave={flashcard.handleSaveGeneratedCard}
        onCancel={flashcard.closeGeneratedCardEditModal}
        isDark={isDark}
      />
    </>
  );
}
