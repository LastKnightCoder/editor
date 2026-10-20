import { useState, useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { Descendant } from "slate";

import { toast } from "@tau/ui";

import useLLMConfig from "@/hooks/useLLMConfig";
import useFlashcardGeneration, { GeneratedFlashcard } from "./useFlashcardGeneration";
import { useFlashcardMutations } from "../queries";
import useSettingStore from "@/stores/useSettingStore";
import type { Flashcard, FlashcardDeck, FlashcardReferenceInput } from "@/types";

interface UseFlashcardCreationOptions {
  mode: "manual" | "ai";
  getContent: () => Descendant[];
  getReferences: () => FlashcardReferenceInput[];
  onCreated(card: Flashcard): void;
  onFinish(completed: boolean): void;
  assertActive(): void;
}

export default function useFlashcardCreation(options: UseFlashcardCreationOptions) {
  const { getContent, getReferences, onCreated, onFinish } = options;
  const saving = useRef(false);
  const saved = useRef(new Set<string>());
  const [isSaving, setIsSaving] = useState(false);

  // 状态
  const [deckSelectorOpen, setDeckSelectorOpen] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<FlashcardDeck | null>(null);
  const [flashcardEditorOpen, setFlashcardEditorOpen] = useState(false);
  const [aiGenerationModalOpen, setAiGenerationModalOpen] = useState(false);
  const [editingGeneratedCard, setEditingGeneratedCard] = useState<GeneratedFlashcard | null>(null);
  const [generatedCardEditModalOpen, setGeneratedCardEditModalOpen] = useState(false);

  // LLM 配置
  const { provider: flashcardLLMProviderSetting, model: flashcardLLMModelSetting } =
    useLLMConfig("flashcardGeneration");

  // 闪卡生成 hook
  const {
    generatedCards,
    isGenerating,
    isPending: isGenerationPending,
    error: generationError,
    startGeneration,
    stopGeneration,
    toggleCardSelection,
    selectAll,
    deselectAll,
    removeCard,
    updateCard,
    reset: resetGeneration,
  } = useFlashcardGeneration(flashcardLLMProviderSetting, flashcardLLMModelSetting);

  const { createCard: createFlashcard } = useFlashcardMutations();
  const database = useSettingStore(state => state.setting.database.active);
  const previousDatabase = useRef(database);
  useEffect(() => {
    if (previousDatabase.current === database) return;
    previousDatabase.current = database;
    resetGeneration();
    setDeckSelectorOpen(false);
    setSelectedDeck(null);
    setFlashcardEditorOpen(false);
    setAiGenerationModalOpen(false);
    setEditingGeneratedCard(null);
    setGeneratedCardEditModalOpen(false);
  }, [database, resetGeneration]);

  // 打开手动制卡
  const openManualFlashcard = useMemoizedFn(() => {
    setDeckSelectorOpen(true);
  });

  // 打开 AI 制卡
  const openAiFlashcard = useMemoizedFn(() => {
    if (!flashcardLLMProviderSetting || !flashcardLLMModelSetting) {
      toast.error("请先在设置中配置闪卡生成的模型");
      onFinish(false);
      return;
    }
    setDeckSelectorOpen(true);
  });

  // 处理卡组选择
  const handleDeckSelect = useMemoizedFn((deck: FlashcardDeck) => {
    setSelectedDeck(deck);
    setDeckSelectorOpen(false);

    if (options.mode === "manual") {
      setFlashcardEditorOpen(true);
    } else {
      setAiGenerationModalOpen(true);
      startGeneration(getContent());
    }
  });

  // 确认 AI 生成的闪卡
  const handleConfirmAiGeneration = useMemoizedFn(async () => {
    if (!selectedDeck || saving.current) return;

    const selectedCards = generatedCards.filter(c => c.selected && !saved.current.has(c.id));
    if (selectedCards.length === 0) {
      toast.warning("请至少选择一张闪卡");
      return;
    }

    saving.current = true;
    setIsSaving(true);
    try {
      const references = getReferences();
      let successCount = 0;

      for (const card of selectedCards) {
        options.assertActive();
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
            references,
          });
          onCreated(created);
          saved.current.add(card.id);
          removeCard(card.id);
          successCount++;
        } catch (err) {
          console.error("创建闪卡失败:", err);
        }
      }

      if (useSettingStore.getState().setting.database.active !== database) return;
      if (successCount !== selectedCards.length) {
        toast.error(`已保存 ${successCount} 张，其余闪卡保存失败，可重试`);
        return;
      }
      toast.success(`成功创建 ${successCount} 张闪卡`);
      setAiGenerationModalOpen(false);
      resetGeneration();
      setSelectedDeck(null);
      onFinish(true);
    } catch (err) {
      toast.error("创建闪卡失败");
      console.error(err);
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  });

  // 取消 AI 生成
  const handleCancelAiGeneration = useMemoizedFn(() => {
    if (saving.current) return;
    stopGeneration();
    resetGeneration();
    setAiGenerationModalOpen(false);
    setSelectedDeck(null);
    onFinish(false);
  });

  // 编辑 AI 生成的闪卡
  const handleEditGeneratedCard = useMemoizedFn((card: GeneratedFlashcard) => {
    setEditingGeneratedCard(card);
    setGeneratedCardEditModalOpen(true);
  });

  // 保存编辑后的 AI 生成闪卡
  const handleSaveGeneratedCard = useMemoizedFn(
    (updates: Partial<Omit<GeneratedFlashcard, "id" | "selected">>) => {
      if (!editingGeneratedCard) return;
      updateCard(editingGeneratedCard.id, updates);
      setGeneratedCardEditModalOpen(false);
      setEditingGeneratedCard(null);
      toast.success("闪卡已更新");
    }
  );

  // 关闭手动制卡编辑器
  const closeFlashcardEditor = useMemoizedFn(() => {
    setFlashcardEditorOpen(false);
    setSelectedDeck(null);
    onFinish(true);
  });

  // 关闭卡组选择器
  const closeDeckSelector = useMemoizedFn(() => {
    setDeckSelectorOpen(false);
  });

  // 关闭编辑弹窗
  const closeGeneratedCardEditModal = useMemoizedFn(() => {
    setGeneratedCardEditModalOpen(false);
    setEditingGeneratedCard(null);
  });

  // 更换卡组
  const changeDeck = useMemoizedFn(() => {
    if (saving.current) return;
    setAiGenerationModalOpen(false);
    resetGeneration();
    setDeckSelectorOpen(true);
  });

  return {
    // 状态
    deckSelectorOpen,
    selectedDeck,
    flashcardEditorOpen,
    aiGenerationModalOpen,
    editingGeneratedCard,
    generatedCardEditModalOpen,

    // AI 生成相关
    generatedCards,
    isGenerating,
    isGenerationPending,
    generationError,

    // 方法
    isSaving,
    openManualFlashcard,
    openAiFlashcard,
    handleDeckSelect,
    handleConfirmAiGeneration,
    handleCancelAiGeneration,
    handleEditGeneratedCard,
    handleSaveGeneratedCard,
    toggleCardSelection,
    selectAll,
    deselectAll,
    closeFlashcardEditor,
    closeDeckSelector,
    closeGeneratedCardEditModal,
    changeDeck,
  };
}
