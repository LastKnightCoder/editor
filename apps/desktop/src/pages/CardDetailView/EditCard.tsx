import { useEffect, useMemo, useRef, useState } from "react";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";
import { Descendant, Range, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import {
  LinkOutlined,
  ReadOutlined,
  MoreOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { Drawer, Tooltip, Dropdown, MenuProps, App } from "antd";
import SVG from "react-inlinesvg";
import { MdOutlineCode } from "react-icons/md";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";

import { Editor, EditorRef } from "@tau/editor/src";
import AddTag from "@/components/AddTag";
import ErrorBoundary from "@/components/ErrorBoundary";
import EditorSourceValue from "@/components/EditorSourceValue";
import LinkGraph from "@/components/LinkGraph";
import PresentationMode from "@/components/PresentationMode";
import StatusBar from "@/components/StatusBar";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import ImmersiveEditorMode, {
  type ImmersiveEditorExitPayload,
} from "@/components/ImmersiveEditorMode";

import useEditContent from "@/hooks/useEditContent";
import useRegisterActiveEditingContext from "@/hooks/useRegisterActiveEditingContext";
import useFlashcardCreation from "@/hooks/useFlashcardCreation";
import DeckSelectorModal from "@/components/DeckSelectorModal";
import FlashcardGenerationModal from "@/components/FlashcardGenerationModal";
import GeneratedFlashcardEditModal from "@/components/GeneratedFlashcardEditModal";
import FlashcardEditor from "@/pages/FlashcardCenter/FlashcardEditor";

import useSettingStore from "@/stores/useSettingStore";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";

import { EditCardContext } from "@/context";
import {
  defaultCardEventBus,
  downloadMarkdown,
  getAllLinkedCards,
  getEditorText,
  getInlineLinks,
  getMarkdown,
  formatDate,
  copyMarkdownToClipboard,
  copyWechatHtmlToClipboard,
} from "@/utils";
import { ICard } from "@/types";
import { deleteCard, getAllCards, openCardInNewWindow } from "@/commands";
import graphIcon from "@/assets/icons/graph.svg";

import useEditCard from "./useEditCard";
import LinkList from "./LinkList";
import { isValid } from "@/components/WhiteBoard/utils";
import PodcastPlayer from "@/components/PodcastPlayer";
import PodcastGenerationModal from "@/components/PodcastGenerationModal";
import {
  attachPodcastToCard,
  detachPodcastFromCard,
  getCardById,
} from "@/commands";
import usePodcastAttachment from "@/hooks/usePodcastAttachment";

const minFitViewPadding = [120];
const maxFitViewPadding = [80];

const cloneRange = (selection: Range | null): Range | null => {
  if (!selection) return null;
  return {
    anchor: {
      path: [...selection.anchor.path],
      offset: selection.anchor.offset,
    },
    focus: {
      path: [...selection.focus.path],
      offset: selection.focus.offset,
    },
  };
};

interface IEditCardProps {
  cardId: number;
  defaultReadonly?: boolean;
}

const EditCard = (props: IEditCardProps) => {
  const { cardId, defaultReadonly = false } = props;
  const dynamicExtensions = useDynamicExtensionsStore(
    (state) => state.extensions,
  );
  const navigateTo = useTabStore((state) => state.navigateTo);
  const openInNewTab = useTabStore((state) => state.openInNewTab);
  const panes = useTabStore((state) => state.panes);
  const activePaneId = useTabStore((state) => state.activePaneId);
  const { modal, message } = App.useApp();
  const databaseName = useSettingStore(
    (state) => state.setting.database.active,
  );
  const darkMode = useSettingStore((state) => state.setting.darkMode);
  const {
    onInit,
    loading,
    editingCard,
    onContentChange: onContentChangeFromEditCard,
    onAddTag,
    onDeleteTag,
    onTagChange,
    saveCard,
    onAddLinks,
    onRemoveLink,
    setEditingCard,
    prevCard,
  } = useEditCard(cardId);

  const { throttleHandleEditorContentChange } = useEditContent(
    editingCard?.contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
    },
  );

  const editorRef = useRef<EditorRef>(null);
  const immersiveEntrySelectionRef = useRef<Range | null>(null);
  const pendingSelectionRef = useRef<Range | null>(null);
  const {
    handleSelectionChange: handleEditorSelectionChange,
    handleFocus: handleEditorFocus,
    handleBlur: handleEditorBlur,
  } = useRegisterActiveEditingContext({
    contentId: editingCard?.contentId,
    entityType: "card",
    entityId: editingCard?.id,
    editorRef,
    content: editingCard?.content,
  });
  const cardEventBus = useCreation(
    () => defaultCardEventBus.createEditor(),
    [],
  );
  const [cards, setCards] = useState<ICard[]>([]);
  const [readonly, setReadonly] = useState(defaultReadonly);
  const [editorSourceValueOpen, setEditorSourceValueOpen] = useState(false);
  const [linkListOpen, setLinkListOpen] = useState(false);
  const [linkGraphOpen, setLinkGraphOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [epubExportModalOpen, setEpubExportModalOpen] = useState(false);
  const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [editorRemountKey, setEditorRemountKey] = useState(0);
  const [updateTime, setUpdateTime] = useState(editingCard?.update_time || 0);

  // 闪卡生成
  const flashcard = useFlashcardCreation({
    getContent: () => editingCard?.content || [],
    getReference: () => ({
      refType: "content",
      contentId: editingCard?.contentId || 0,
      title: getEditorText(editingCard?.content || [], 20) || "卡片参考",
    }),
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!readonly) {
      throttleHandleEditorContentChange(content);
    }
    onContentChangeFromEditCard(content);
    setUpdateTime(Date.now());
  });

  useEffect(() => {
    if (editingCard?.update_time) {
      setUpdateTime(editingCard?.update_time);
    }
  }, [editingCard?.update_time]);

  const handleImmersiveExit = useMemoizedFn(
    (payload?: ImmersiveEditorExitPayload) => {
      pendingSelectionRef.current = payload?.selection ?? null;
      setImmersiveMode(false);
      setEditorRemountKey((current) => current + 1);
    },
  );

  useEffect(() => {
    if (immersiveMode || !pendingSelectionRef.current) return;

    const timer = window.setTimeout(() => {
      const editor = editorRef.current?.getEditor();
      const selection = pendingSelectionRef.current;
      if (!editor || !selection) return;

      try {
        Transforms.select(editor, selection);
        ReactEditor.focus(editor as any);
        pendingSelectionRef.current = null;
      } catch (error) {
        console.warn("恢复沉浸模式焦点失败:", error);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [editorRemountKey, immersiveMode]);

  const handleEnterImmersiveMode = useMemoizedFn(() => {
    immersiveEntrySelectionRef.current = cloneRange(
      editorRef.current?.getEditor().selection ?? null,
    );
    setImmersiveMode(true);
  });

  const handleDeleteCard = useMemoizedFn(async (cardId: number) => {
    try {
      modal.confirm({
        title: "删除卡片",
        content: "确定要删除该卡片吗？",
        okText: "确定",
        cancelText: "取消",
        okButtonProps: {
          danger: true,
        },
        onOk: async () => {
          await deleteCard(cardId);
          navigateTo(TabType.CardList);
        },
      });
    } catch (error) {
      console.error("删除卡片失败", error);
    }
  });

  const {
    podcastModalOpen,
    openPodcastModal,
    closePodcastModal,
    handlePodcastSuccess,
    handleDeletePodcast,
  } = usePodcastAttachment({
    hostId: cardId,
    currentPodcast: editingCard?.podcast,
    attachPodcast: attachPodcastToCard,
    detachPodcast: detachPodcastFromCard,
    reloadHost: getCardById,
    onHostReloaded: setEditingCard,
    message,
    messages: {
      created: "播客已添加到卡片",
    },
  });

  useEffect(() => {
    getAllCards().then((res) => {
      setCards(res);
    });
  }, []);

  const getCardLinks = useMemoizedFn((card: ICard) => {
    const links = getInlineLinks(card);
    return [...new Set([...links, ...card.links])];
  });

  const allLinkedCards = useMemo(() => {
    if (!editingCard) return [];
    const links = getAllLinkedCards(editingCard, cards);
    return links;
  }, [cards, editingCard]);

  const handleAddTag = useMemoizedFn((tag: string) => {
    if (!editingCard || editingCard.tags.includes(tag)) return;
    onAddTag(tag);
  });

  const handleDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingCard || !editingCard.tags.includes(tag)) return;
    onDeleteTag(tag);
  });

  const handleEditTag = useMemoizedFn((oldTag: string, newTag: string) => {
    if (!editingCard || !newTag || newTag === oldTag) return;
    if (editingCard.tags.includes(newTag)) {
      message.warning("标签已存在");
      return;
    }
    // 直接替换标签，保持顺序
    const newTags = editingCard.tags.map((tag) =>
      tag === oldTag ? newTag : tag,
    );
    onTagChange(newTags);
  });

  useRafInterval(async () => {
    if (!readonly) {
      const updatedCard = await saveCard();
      if (updatedCard) {
        cardEventBus.publishCardEvent("card:updated", updatedCard);
      }
    }
  }, 500);

  useUnmount(async () => {
    if (!readonly) {
      throttleHandleEditorContentChange.flush();
      const updatedCard = await saveCard();
      if (updatedCard) {
        cardEventBus.publishCardEvent("card:updated", updatedCard);
      }
    }
  });

  useEffect(() => {
    const unsubscribe = cardEventBus.subscribeToCardWithId(
      "card:updated",
      cardId,
      (data) => {
        setEditingCard(data.card);
        prevCard.current = data.card;
      },
    );

    return () => {
      unsubscribe();
    };
  }, [cardId, cardEventBus, setEditingCard]);

  const statusBarConfigs = useMemo(() => {
    return [
      {
        key: "words-count",
        children: <>字数：{editingCard?.count}</>,
      },
      {
        key: "readonly",
        children: (
          <>
            {readonly ? (
              <Tooltip title={"编辑"}>
                <span>
                  <EditOutlined />
                </span>
              </Tooltip>
            ) : (
              <Tooltip title={"预览"}>
                <span>
                  <ReadOutlined />
                </span>
              </Tooltip>
            )}
          </>
        ),
        onClick: () => {
          setReadonly(!readonly);
        },
      },
      {
        key: "link-list",
        children: (
          <>
            <Tooltip title={"关联列表"}>
              <span>
                <LinkOutlined />
              </span>
            </Tooltip>
          </>
        ),
        onClick: () => {
          setLinkListOpen(true);
        },
      },
      {
        key: "link-graph",
        children: (
          <>
            <Tooltip title={"关联图谱"}>
              <span>
                <SVG src={graphIcon} style={{ fill: "currentcolor" }} />
              </span>
            </Tooltip>
          </>
        ),
        onClick: () => {
          setLinkGraphOpen(true);
        },
      },
      {
        key: "source",
        children: (
          <>
            <Tooltip title={"源码"}>
              <span>
                <MdOutlineCode className="text-base" />
              </span>
            </Tooltip>
          </>
        ),
        onClick: () => {
          setEditorSourceValueOpen(true);
        },
      },
    ].filter(isValid);
  }, [readonly, editingCard?.count]);

  const handleClickLinkCard = useMemoizedFn((card: ICard) => {
    // 确定在哪个 pane 中打开 - 尝试在另一个 pane 中打开
    let targetPaneId: string | undefined;
    if (panes.length > 1) {
      const otherPane = panes.find((p) => p.id !== activePaneId);
      targetPaneId = otherPane?.id;
    }

    openInNewTab(
      TabType.CardDetail,
      { id: card.id },
      targetPaneId,
      getEditorText(card.content, 10),
    );
  });

  const handleMoreMenuClick = useMemoizedFn(
    async ({ key }: { key: string }) => {
      if (!editingCard) return;

      if (key === "presentation") {
        setPresentationMode(true);
      } else if (key === "immersive-mode") {
        handleEnterImmersiveMode();
      } else if (key === "generate-podcast") {
        openPodcastModal();
      } else if (key === "open-window") {
        openCardInNewWindow(databaseName, editingCard.id);
        navigateTo(TabType.CardList);
      } else if (key === "open-sidebar") {
        // 确定在哪个 pane 中打开 - 尝试在另一个 pane 中打开
        let targetPaneId: string | undefined;
        if (panes.length > 1) {
          const otherPane = panes.find((p) => p.id !== activePaneId);
          targetPaneId = otherPane?.id;
        }

        openInNewTab(
          TabType.CardDetail,
          { id: editingCard.id },
          targetPaneId,
          getEditorText(editingCard.content, 10),
        );
        navigateTo(TabType.CardList);
      } else if (key === "copy-markdown") {
        await copyMarkdownToClipboard(editingCard.content, message);
      } else if (key === "copy-wechat") {
        await copyWechatHtmlToClipboard(editingCard.content, message);
      } else if (key === "export-markdown") {
        const markdown = getMarkdown(editingCard.content);
        downloadMarkdown(markdown, String(editingCard.id));
      } else if (key === "export-image") {
        setExportModalOpen(true);
      } else if (key === "export-epub") {
        setEpubExportModalOpen(true);
      } else if (key === "export-pdf") {
        setPdfExportModalOpen(true);
      } else if (key === "delete-card") {
        handleDeleteCard(editingCard.id);
      } else if (key === "manual-flashcard") {
        flashcard.openManualFlashcard();
      } else if (key === "ai-flashcard") {
        flashcard.openAiFlashcard();
      }
    },
  );

  const moreMenuItems: MenuProps["items"] = useMemo(() => {
    return [
      {
        key: "create-flashcard",
        label: "制作闪卡",
        children: [
          {
            key: "manual-flashcard",
            label: "手动制卡",
          },
          {
            key: "ai-flashcard",
            label: "AI 制卡",
          },
        ],
      },
      {
        key: "presentation",
        label: "演示模式",
      },
      {
        key: "immersive-mode",
        label: "沉浸模式",
      },
      {
        key: "generate-podcast",
        label: "生成播客",
      },
      {
        key: "open-window",
        label: "窗口打开",
      },
      {
        key: "open-sidebar",
        label: "新Tab打开",
      },
      {
        key: "copy",
        label: "复制卡片",
        children: [
          {
            key: "copy-markdown",
            label: "Markdown",
          },
          {
            key: "copy-wechat",
            label: "微信公众号",
          },
        ],
      },
      {
        key: "export",
        label: "导出卡片",
        children: [
          {
            key: "export-markdown",
            label: "Markdown",
          },
          {
            key: "export-image",
            label: "图片",
          },
          {
            key: "export-epub",
            label: "EPUB",
          },
          {
            key: "export-pdf",
            label: "PDF",
          },
        ],
      },
      {
        key: "delete-card",
        label: "删除卡片",
      },
    ];
  }, []);

  if (loading) {
    return (
      <div className="w-full h-full flex justify-center items-center">
        Loading...
      </div>
    );
  }

  if (!editingCard) {
    return null;
  }

  return (
    <EditCardContext.Provider
      value={{
        cardId: editingCard.id,
      }}
    >
      <div className="relative mx-auto w-full h-full flex flex-col">
        <div className="mb-6 flex opacity-80 text-sm shrink-0 mx-auto w-full max-w-[min(100%,800px)] px-5 box-border justify-between">
          <div className="flex-1 flex gap-2.5">
            <div>
              <span>创建于 {formatDate(editingCard.create_time, true)}</span>
            </div>
            <div>
              <span>
                最后修改于{" "}
                {formatDate(updateTime || editingCard.update_time, true)}
              </span>
            </div>
          </div>
          <div className="flex items-center cursor-pointer ml-auto hover:opacity-70">
            <Dropdown
              menu={{ items: moreMenuItems, onClick: handleMoreMenuClick }}
            >
              <MoreOutlined />
            </Dropdown>
          </div>
        </div>
        <div className="flex-1 min-h-0 w-full overflow-auto">
          <div className="w-full px-5 box-border mx-auto max-w-[min(100%,800px)]">
            {editingCard.podcast && (
              <PodcastPlayer
                defaultPodcast={editingCard.podcast}
                onDelete={handleDeletePodcast}
                onEdit={openPodcastModal}
              />
            )}
            <ErrorBoundary>
              <Editor
                key={`normal-${editingCard.id}-${editorRemountKey}`}
                ref={editorRef}
                onInit={onInit}
                initValue={editingCard.content}
                onChange={onContentChange}
                onSelectionChange={handleEditorSelectionChange}
                onFocus={handleEditorFocus}
                onBlur={handleEditorBlur}
                extensions={dynamicExtensions}
                readonly={readonly}
              />
            </ErrorBoundary>
          </div>
        </div>
        <div className="mt-4 shrink-0 mx-auto w-full max-w-[min(100%,800px)] px-5 box-border">
          <AddTag
            tags={editingCard.tags}
            addTag={handleAddTag}
            removeTag={handleDeleteTag}
            editTag={handleEditTag}
            readonly={readonly}
            onReorder={onTagChange}
          />
        </div>

        <StatusBar
          className="h-[30px] flex items-center justify-between absolute bottom-5 right-9"
          configs={statusBarConfigs}
        />
        <Drawer
          title="关联列表"
          open={linkListOpen}
          size={500}
          onClose={() => setLinkListOpen(false)}
        >
          <LinkList
            onClickLinkCard={handleClickLinkCard}
            addLinks={onAddLinks}
            removeLink={onRemoveLink}
            editingCard={editingCard}
            readonly={readonly}
          />
        </Drawer>
        <Drawer
          title="关联图谱"
          open={linkGraphOpen}
          size={500}
          onClose={() => setLinkGraphOpen(false)}
        >
          <LinkGraph
            key={editingCard.id}
            initCards={allLinkedCards}
            currentCardIds={[editingCard.id]}
            cardWidth={360}
            getCardLinks={getCardLinks}
            fitView={true}
            fitViewPadding={
              allLinkedCards.length > 20 ? maxFitViewPadding : minFitViewPadding
            }
            style={{
              height: "calc(100vh - 105px)",
            }}
            onClickCard={handleClickLinkCard}
          />
        </Drawer>
        <EditorSourceValue
          open={editorSourceValueOpen}
          onClose={() => setEditorSourceValueOpen(false)}
          content={editingCard.content}
        />
        {presentationMode && (
          <PresentationMode
            content={editingCard.content}
            onExit={() => {
              setPresentationMode(false);
            }}
          />
        )}
        {immersiveMode && (
          <ImmersiveEditorMode
            initValue={editingCard.content}
            initialSelection={immersiveEntrySelectionRef.current}
            onChange={onContentChange}
            onInit={onInit}
            onExit={handleImmersiveExit}
            wordCount={editingCard.count}
            readonly={readonly}
            extensions={dynamicExtensions}
          />
        )}
        <ContentExportModal
          open={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          content={editingCard.content}
        />
        <EpubExportModal
          open={epubExportModalOpen}
          onClose={() => setEpubExportModalOpen(false)}
          content={editingCard.content}
          title={
            getEditorText(editingCard.content, 20) || `卡片 #${editingCard.id}`
          }
        />
        <PdfExportModal
          visible={pdfExportModalOpen}
          onClose={() => setPdfExportModalOpen(false)}
          content={editingCard.content}
          title={
            getEditorText(editingCard.content, 20) || `卡片 #${editingCard.id}`
          }
        />

        <PodcastGenerationModal
          open={podcastModalOpen}
          cardContent={editingCard.content}
          initialPodcast={editingCard.podcast}
          onSuccess={handlePodcastSuccess}
          onCancel={closePodcastModal}
          saveText="保存到卡片"
        />

        {/* 卡组选择弹窗 */}
        <DeckSelectorModal
          open={flashcard.deckSelectorOpen}
          onCancel={flashcard.closeDeckSelector}
          onSelect={flashcard.handleDeckSelect}
          title={
            flashcard.deckSelectorMode === "manual"
              ? "选择卡组 - 手动制卡"
              : "选择卡组 - AI 制卡"
          }
        />

        {/* 手动制卡编辑器 */}
        {flashcard.flashcardEditorOpen && flashcard.selectedDeck && (
          <FlashcardEditor
            open={flashcard.flashcardEditorOpen}
            mode="create"
            activeDeckId={flashcard.selectedDeck.id}
            onClose={flashcard.closeFlashcardEditor}
            isDark={darkMode}
            initialReferences={[flashcard.getReference()]}
          />
        )}

        {/* AI 生成闪卡弹窗 */}
        <FlashcardGenerationModal
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
          onConfirm={flashcard.handleConfirmAiGeneration}
          onChangeDeck={flashcard.changeDeck}
          onEditCard={flashcard.handleEditGeneratedCard}
        />

        {/* 编辑 AI 生成的闪卡弹窗 */}
        <GeneratedFlashcardEditModal
          open={flashcard.generatedCardEditModalOpen}
          card={flashcard.editingGeneratedCard}
          onSave={flashcard.handleSaveGeneratedCard}
          onCancel={flashcard.closeGeneratedCardEditModal}
          isDark={darkMode}
        />
      </div>
    </EditCardContext.Provider>
  );
};

export default EditCard;
