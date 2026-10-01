import { useState, useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { toast } from "@tau/ui";

import useConversationFlashcardStore from "@/stores/useConversationFlashcardStore";
import { recordLineage } from "@/commands/lineage";
import { useFlashcardMutations } from "../queries";
import useSettingStore from "@/stores/useSettingStore";
import useFlashcardGeneration, { GeneratedFlashcard } from "../hooks/useFlashcardGeneration";
import useLLMConfig from "@/hooks/useLLMConfig";
import useTheme from "@/hooks/useTheme";
import DeckSelectorModal from "@/features/flashcards/components/DeckSelectorDialog";
import FlashcardGenerationModal from "@/features/flashcards/components/FlashcardGenerationDialog";
import GeneratedFlashcardEditModal from "@/features/flashcards/components/GeneratedFlashcardEditDialog";
import { importFromMarkdown } from "@/utils/markdown";
import type { FlashcardDeck, FlashcardReferenceInput } from "@/types";

const ConversationFlashcardModal = () => {
  const { isDark } = useTheme();

  // Store 状态
  const { isModalOpen, conversationContent, source, chatTitle, reset } =
    useConversationFlashcardStore();

  // 本地状态
  const [deckSelectorOpen, setDeckSelectorOpen] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<FlashcardDeck | null>(null);
  const [generationModalOpen, setGenerationModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<GeneratedFlashcard | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // LLM 配置
  const { provider, model } = useLLMConfig("flashcardGeneration");

  // 闪卡生成 hook
  const {
    generatedCards,
    isGenerating,
    isPending,
    error,
    startGeneration,
    stopGeneration,
    toggleCardSelection,
    selectAll,
    deselectAll,
    updateCard,
    reset: resetGeneration,
  } = useFlashcardGeneration(provider, model);

  const { createCard: createFlashcard } = useFlashcardMutations();
  const database = useSettingStore(state => state.setting.database.active);
  const previousDatabase = useRef(database);
  useEffect(() => {
    if (previousDatabase.current === database) return;
    previousDatabase.current = database;
    resetGeneration();
    setDeckSelectorOpen(false);
    setSelectedDeck(null);
    setGenerationModalOpen(false);
    setEditingCard(null);
    setEditModalOpen(false);
    reset();
  }, [database, resetGeneration, reset]);

  // 当 store 被触发打开时，显示卡组选择器
  useEffect(() => {
    if (isModalOpen && conversationContent) {
      // 检查 LLM 配置
      if (!provider || !model) {
        toast.error("请先在设置中配置闪卡生成的模型");
        reset();
        return;
      }
      setDeckSelectorOpen(true);
    }
  }, [isModalOpen, conversationContent, provider, model, reset]);

  // 处理卡组选择
  const handleDeckSelect = useMemoizedFn((deck: FlashcardDeck) => {
    setSelectedDeck(deck);
    setDeckSelectorOpen(false);
    setGenerationModalOpen(true);

    // 将 Markdown 转换为 Descendant[] 并开始生成
    if (conversationContent) {
      const descendants = importFromMarkdown(conversationContent);
      startGeneration(descendants);
    }
  });

  // 取消卡组选择
  const handleDeckSelectorCancel = useMemoizedFn(() => {
    setDeckSelectorOpen(false);
    reset();
  });

  // 确认 AI 生成的闪卡
  const handleConfirmGeneration = useMemoizedFn(async () => {
    if (!selectedDeck) return;

    const selectedCards = generatedCards.filter(c => c.selected);
    if (selectedCards.length === 0) {
      toast.warning("请至少选择一张闪卡");
      return;
    }

    try {
      // 创建参考来源（关联到对话内容）
      const reference: FlashcardReferenceInput = {
        refType: "custom",
        title: `对话: ${chatTitle || "未命名对话"}`,
        customContent: conversationContent ? importFromMarkdown(conversationContent) : [],
      };

      let successCount = 0;

      for (const card of selectedCards) {
        if (useSettingStore.getState().setting.database.active !== database) return;
        try {
          const created = await createFlashcard({
            deckId: selectedDeck.id,
            type: card.type,
            prompt: card.prompt,
            detail: card.detail,
            difficulty: card.difficulty,
            tags: card.tags,
            data: card.data,
            references: [reference],
          });
          // 参考资料是对话摘要的副本，记不住出处；谱系记下对话与消息（KL-025）
          if (source) {
            await recordLineage({
              src: { kind: "chat-session", id: source.sessionId },
              dst: { kind: "flashcard", id: created.id },
              relation: "saved_from",
              srcAnchor: { messageIds: source.messageIds },
            });
          }
          successCount++;
        } catch (err) {
          console.error("创建闪卡失败:", err);
        }
      }

      if (useSettingStore.getState().setting.database.active !== database) return;
      toast.success(`成功创建 ${successCount} 张闪卡`);
      handleCloseAll();
    } catch (err) {
      toast.error("创建闪卡失败");
      console.error(err);
    }
  });

  // 取消生成
  const handleCancelGeneration = useMemoizedFn(() => {
    stopGeneration();
    handleCloseAll();
  });

  // 关闭所有弹窗并重置状态
  const handleCloseAll = useMemoizedFn(() => {
    setGenerationModalOpen(false);
    setDeckSelectorOpen(false);
    setSelectedDeck(null);
    setEditingCard(null);
    setEditModalOpen(false);
    resetGeneration();
    reset();
  });

  // 更换卡组
  const handleChangeDeck = useMemoizedFn(() => {
    setGenerationModalOpen(false);
    resetGeneration();
    setDeckSelectorOpen(true);
  });

  // 编辑生成的闪卡
  const handleEditCard = useMemoizedFn((card: GeneratedFlashcard) => {
    setEditingCard(card);
    setEditModalOpen(true);
  });

  // 保存编辑后的闪卡
  const handleSaveCard = useMemoizedFn(
    (updates: Partial<Omit<GeneratedFlashcard, "id" | "selected">>) => {
      if (!editingCard) return;
      updateCard(editingCard.id, updates);
      setEditModalOpen(false);
      setEditingCard(null);
      toast.success("闪卡已更新");
    }
  );

  // 关闭编辑弹窗
  const handleCancelEdit = useMemoizedFn(() => {
    setEditModalOpen(false);
    setEditingCard(null);
  });

  return (
    <>
      {/* 卡组选择弹窗 */}
      <DeckSelectorModal
        open={deckSelectorOpen}
        onCancel={handleDeckSelectorCancel}
        onSelect={handleDeckSelect}
        title="选择卡组"
        subtitle="选择要保存闪卡的卡组"
      />

      {/* 闪卡生成弹窗 */}
      <FlashcardGenerationModal
        open={generationModalOpen}
        onCancel={handleCancelGeneration}
        isGenerating={isGenerating}
        isPending={isPending}
        error={error}
        generatedCards={generatedCards}
        selectedDeck={selectedDeck}
        onToggleCard={toggleCardSelection}
        onSelectAll={selectAll}
        onDeselectAll={deselectAll}
        onConfirm={handleConfirmGeneration}
        onChangeDeck={handleChangeDeck}
        onEditCard={handleEditCard}
      />

      {/* 编辑闪卡弹窗 */}
      <GeneratedFlashcardEditModal
        open={editModalOpen}
        card={editingCard}
        onSave={handleSaveCard}
        onCancel={handleCancelEdit}
        isDark={isDark}
      />
    </>
  );
};

export default ConversationFlashcardModal;
