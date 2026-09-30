import { ReactNode, useMemo, useState } from "react";
import { ConfirmDialog } from "@tau/ui";
import type { MenuEntryList } from "../../shared/menuEntries";
import { produce } from "immer";

import ContentExportModal from "@/components/ContentExportModal";
import DeckSelectorModal from "@/features/flashcards/components/DeckSelectorDialog";
import EditTitleModal from "@/components/EditTitleModal";
import EpubExportModal from "@/components/EpubExportModal";
import FlashcardEditor from "@/features/flashcards/components/CreateFlashcardDialog";
import FlashcardGenerationModal from "@/features/flashcards/components/FlashcardGenerationDialog";
import GeneratedFlashcardEditModal from "@/features/flashcards/components/GeneratedFlashcardEditDialog";
import PodcastGenerationModal from "@/components/PodcastGenerationModal";
import PresentationMode from "@/components/PresentationMode";
import { PdfExportModal } from "@/components/PdfExportModal";
import useFlashcardCreation from "@/features/flashcards/hooks/useFlashcardCreation";
import usePodcastAttachment from "@/hooks/usePodcastAttachment";
import useProjectWebLinkMeta from "@/hooks/useProjectWebLinkMeta";
import useSettingStore from "@/stores/useSettingStore";
import { useThemeStore } from "@tau/themes/react";
import { usePage } from "@/page/PageProvider";
import { attachPodcastToProjectItem, detachPodcastFromProjectItem } from "@/commands/podcast";
import {
  getProjectItemById,
  openProjectItemInNewWindow,
  removeChildProjectItem,
  removeRootProjectItem,
  updateProjectItem,
  updateWebLink,
} from "@/commands";
import { useWhiteboardMutations } from "@/features/whiteboards/queries";
import {
  copyMarkdownToClipboard,
  copyWechatHtmlToClipboard,
  defaultProjectItemEventBus,
  downloadMarkdown,
  getMarkdown,
} from "@/utils";
import { EProjectItemType, ProjectItem } from "@/types";
import { useMemoizedFn } from "ahooks";
import useContentShared from "@/hooks/useContentShared";
import { getProjectItemMoreMenuItems } from "./projectItemMoreMenuItems";
import { toast } from "@tau/ui";
import { useProjectContext } from "../../ProjectContext";

interface UseProjectItemMoreActionsOptions {
  projectId: number;
  projectItem?: ProjectItem;
  parentProjectItemId: number;
  isRoot?: boolean;
  activeItemId?: number;
  onProjectItemChange?: (projectItem: ProjectItem) => void;
  refreshProject?: () => void;
  reloadTree?: (options?: { silent?: boolean }) => void | Promise<void>;
  getTitleHandle?: () => {
    setValue?: (value: string) => void;
    setContentEditable?: (editable: boolean) => void;
  } | null;
  onRequestInlineTitleEdit?: () => void;
}

export const useProjectItemMoreActions = (
  options: UseProjectItemMoreActionsOptions
): {
  moreMenuItems: MenuEntryList;
  handleMoreMenuClick: (key: string) => void;
  moreActionModals: ReactNode;
} => {
  const {
    projectId,
    projectItem,
    parentProjectItemId,
    isRoot = false,
    activeItemId,
    onProjectItemChange,
    refreshProject,
    reloadTree,
    getTitleHandle,
    onRequestInlineTitleEdit,
  } = options;
  const { requestDocumentAction } = useProjectContext();

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [epubExportModalOpen, setEpubExportModalOpen] = useState(false);
  const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);
  const [editTitleModalOpen, setEditTitleModalOpen] = useState(false);
  const [isPresentation, setIsPresentation] = useState(false);

  const darkMode = useThemeStore(state => state.mode === "dark");
  const { navigator } = usePage();
  const projectItemEventBus = useMemo(() => defaultProjectItemEventBus.createEditor(), []);
  const whiteboardMutations = useWhiteboardMutations();

  const {
    title: projectItemTitle,
    url: displayWebviewUrl,
    linkId: webLinkId,
  } = useProjectWebLinkMeta(projectItem);

  const shared = useContentShared(projectItem?.contentId);
  const moreMenuItems: MenuEntryList = useMemo(
    () => getProjectItemMoreMenuItems(projectItem, shared),
    [projectItem?.projectItemType, projectItem?.refType, projectItem?.podcast, shared]
  );

  const publishProjectItemUpdate = useMemoizedFn((nextProjectItem: ProjectItem) => {
    onProjectItemChange?.(nextProjectItem);
    projectItemEventBus.publishProjectItemEvent("project-item:updated", nextProjectItem);
  });

  const flashcard = useFlashcardCreation({
    getContent: () => projectItem?.content || [],
    getReference: () => ({
      refType: "content",
      contentId: projectItem?.contentId || 0,
      title: projectItem?.title || "项目文档参考",
    }),
  });

  const { podcastModalOpen, openPodcastModal, closePodcastModal, handlePodcastSuccess } =
    usePodcastAttachment({
      hostId: projectItem?.id || 0,
      currentPodcast: projectItem?.podcast,
      attachPodcast: attachPodcastToProjectItem,
      detachPodcast: detachPodcastFromProjectItem,
      reloadHost: getProjectItemById,
      onHostReloaded: publishProjectItemUpdate,
      messages: {
        created: "播客已添加到文档",
      },
    });

  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const handleRemoveProjectItem = useMemoizedFn(() => {
    if (!projectItem) return;
    setRemoveConfirmOpen(true);
  });
  const handleRemoveProjectItemConfirm = useMemoizedFn(async () => {
    if (!projectItem) return;
    {
      {
        if (isRoot) {
          await removeRootProjectItem(projectId, projectItem.id);
          refreshProject?.();
        } else if (parentProjectItemId) {
          const [parentProjectItem] = await removeChildProjectItem(
            projectId,
            parentProjectItemId,
            projectItem.id
          );
          if (parentProjectItem) {
            publishProjectItemUpdate(parentProjectItem);
          }
        }
        await reloadTree?.({ silent: true });
        if (activeItemId === projectItem.id) {
          navigator.push("project-detail", {
            id: projectId,
            itemId: undefined,
          });
        }
      }
    }
  });

  const handleEditTitleConfirm = useMemoizedFn(async (result: { title: string }) => {
    if (!projectItem) {
      setEditTitleModalOpen(false);
      return;
    }

    const textContent = result.title.trim();
    if (!textContent) {
      setEditTitleModalOpen(false);
      return;
    }

    let nextTitle = textContent;
    if (projectItem.projectItemType === EProjectItemType.WebView) {
      if (webLinkId) {
        updateWebLink({
          id: webLinkId,
          title: textContent,
        }).catch(err => console.error("更新网页标题失败:", err));
      } else if (displayWebviewUrl) {
        nextTitle = `${textContent} [${displayWebviewUrl}]`;
      }
    }

    if (nextTitle !== projectItem.title) {
      const updatedProjectItem = await updateProjectItem({
        ...projectItem,
        title: nextTitle,
      });
      if (updatedProjectItem) {
        publishProjectItemUpdate(updatedProjectItem);
        getTitleHandle?.()?.setValue?.(
          projectItem.projectItemType === EProjectItemType.WebView ? textContent : nextTitle
        );
      }
    }

    setEditTitleModalOpen(false);
  });

  const handleMoreMenuClick = useMemoizedFn(async (key: string) => {
    if (!projectItem) return;

    if (key === "immersive-mode" || key === "collaboration") {
      requestDocumentAction?.({
        itemId: projectItem.id,
        type: key === "immersive-mode" ? "immersive" : "collaboration",
      });
    } else if (key === "to-card") {
      const freshProjectItem = await getProjectItemById(projectItem.id);
      if (!freshProjectItem) return;
      const { createCardFromProjectItem } = await import("@/commands");
      const createdCard = await createCardFromProjectItem(freshProjectItem.id);
      const nextProjectItem = produce(freshProjectItem, draft => {
        draft.refId = createdCard.id;
        draft.refType = "card";
      });
      const updatedProjectItem = await updateProjectItem(nextProjectItem);
      if (!updatedProjectItem) return;
      publishProjectItemUpdate(updatedProjectItem);
      const { defaultCardEventBus } = await import("@/utils");
      defaultCardEventBus.createEditor().publishCardEvent("card:created", createdCard);
      toast.success("成功建立卡片");
    } else if (key === "to-white-board") {
      if (
        projectItem.projectItemType !== EProjectItemType.WhiteBoard ||
        !projectItem.whiteBoardContentId
      ) {
        return;
      }
      if (projectItem.refType === "white-board") return;
      try {
        const createdWhiteBoard = await whiteboardMutations.create({
          title: projectItem.title,
          description: projectItem.title,
          tags: [],
        });
        const nextProjectItem = produce(projectItem, draft => {
          draft.refId = createdWhiteBoard.id;
          draft.refType = "white-board";
        });
        const updatedProjectItem = await updateProjectItem(nextProjectItem);
        if (!updatedProjectItem) return;
        publishProjectItemUpdate(updatedProjectItem);
        toast.success("成功创建白板");
      } catch (e) {
        console.error(e);
        toast.error("创建白板失败");
      }
    } else if (key === "remove") {
      await handleRemoveProjectItem();
    } else if (key === "copy-markdown") {
      await copyMarkdownToClipboard(projectItem.content, toast);
    } else if (key === "copy-wechat") {
      await copyWechatHtmlToClipboard(projectItem.content, toast);
    } else if (key === "export-markdown") {
      const markdown = getMarkdown(projectItem.content);
      downloadMarkdown(markdown, projectItem.title);
    } else if (key === "export-image") {
      setExportModalOpen(true);
    } else if (key === "export-epub") {
      setEpubExportModalOpen(true);
    } else if (key === "export-pdf") {
      setPdfExportModalOpen(true);
    } else if (key === "edit-title") {
      if (onRequestInlineTitleEdit) {
        onRequestInlineTitleEdit();
      } else {
        setEditTitleModalOpen(true);
      }
    } else if (key === "presentation-mode") {
      if (projectItem.projectItemType !== EProjectItemType.Document) return;
      setIsPresentation(true);
    } else if (key === "open-in-new-window") {
      const databaseName = useSettingStore.getState().setting.database.active;
      openProjectItemInNewWindow(databaseName, projectItem.id);
    } else if (key === "open-in-new-tab") {
      if (projectItem.projectItemType === EProjectItemType.WebView) {
        if (displayWebviewUrl) {
          navigator.push("webview", { url: displayWebviewUrl });
        } else {
          toast.error("无法提取 URL");
        }
      } else {
        navigator.push("project-detail", { id: projectId, itemId: projectItem.id });
      }
    } else if (key === "manual-flashcard") {
      flashcard.openManualFlashcard();
    } else if (key === "ai-flashcard") {
      flashcard.openAiFlashcard();
    } else if (key === "generate-podcast") {
      openPodcastModal();
    }
  });

  const moreActionModals = (
    <>
      <ConfirmDialog
        open={removeConfirmOpen}
        onOpenChange={setRemoveConfirmOpen}
        title="删除项目文档"
        description="确定删除该项目文档吗？"
        danger
        confirmText="确定"
        onConfirm={async () => {
          setRemoveConfirmOpen(false);
          await handleRemoveProjectItemConfirm();
        }}
      />
      <EditTitleModal
        open={editTitleModalOpen}
        onCancel={() => setEditTitleModalOpen(false)}
        onConfirm={handleEditTitleConfirm}
        initialTitle={
          projectItem?.projectItemType === EProjectItemType.WebView
            ? projectItemTitle
            : projectItem?.title || ""
        }
        modalTitle="编辑标题"
        modalDescription="修改当前项目的显示标题"
        placeholder="请输入标题"
      />

      {isPresentation &&
        projectItem &&
        projectItem.projectItemType === EProjectItemType.Document && (
          <PresentationMode
            content={projectItem.content}
            onExit={() => {
              setIsPresentation(false);
            }}
          />
        )}

      <ContentExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        content={projectItem?.content || []}
        title={projectItem?.title || "项目文档"}
      />
      <EpubExportModal
        open={epubExportModalOpen}
        onClose={() => setEpubExportModalOpen(false)}
        content={projectItem?.content || []}
        title={projectItem?.title || "项目文档"}
      />
      <PdfExportModal
        visible={pdfExportModalOpen}
        onClose={() => setPdfExportModalOpen(false)}
        content={projectItem?.content || []}
        title={projectItem?.title || "项目文档"}
      />
      <DeckSelectorModal
        open={flashcard.deckSelectorOpen}
        onCancel={flashcard.closeDeckSelector}
        onSelect={flashcard.handleDeckSelect}
        title={
          flashcard.deckSelectorMode === "manual" ? "选择卡组 - 手动制卡" : "选择卡组 - AI 制卡"
        }
      />
      {flashcard.flashcardEditorOpen && flashcard.selectedDeck && (
        <FlashcardEditor
          open={flashcard.flashcardEditorOpen}
          activeDeckId={flashcard.selectedDeck.id}
          onClose={flashcard.closeFlashcardEditor}
          initialReferences={[flashcard.getReference()]}
        />
      )}
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
      <GeneratedFlashcardEditModal
        open={flashcard.generatedCardEditModalOpen}
        card={flashcard.editingGeneratedCard}
        onSave={flashcard.handleSaveGeneratedCard}
        onCancel={flashcard.closeGeneratedCardEditModal}
        isDark={darkMode}
      />
      <PodcastGenerationModal
        open={podcastModalOpen}
        cardContent={projectItem?.content || []}
        initialPodcast={projectItem?.podcast}
        onSuccess={handlePodcastSuccess}
        onCancel={closePodcastModal}
        saveText="保存到文档"
      />
    </>
  );

  return {
    moreMenuItems,
    handleMoreMenuClick,
    moreActionModals,
  };
};

export default useProjectItemMoreActions;
