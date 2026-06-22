import { ReactNode, useMemo, useState } from "react";
import { App, MenuProps } from "antd";
import { produce } from "immer";

import ContentExportModal from "@/components/ContentExportModal";
import DeckSelectorModal from "@/components/DeckSelectorModal";
import EditTitleModal from "@/components/EditTitleModal";
import EpubExportModal from "@/components/EpubExportModal";
import FlashcardEditor from "@/pages/FlashcardCenter/FlashcardEditor";
import FlashcardGenerationModal from "@/components/FlashcardGenerationModal";
import GeneratedFlashcardEditModal from "@/components/GeneratedFlashcardEditModal";
import PodcastGenerationModal from "@/components/PodcastGenerationModal";
import PresentationMode from "@/components/PresentationMode";
import { PdfExportModal } from "@/components/PdfExportModal";
import useFlashcardCreation from "@/hooks/useFlashcardCreation";
import usePodcastAttachment from "@/hooks/usePodcastAttachment";
import useProjectWebLinkMeta from "@/hooks/useProjectWebLinkMeta";
import useSettingStore from "@/stores/useSettingStore";
import useTabStore from "@/stores/useTabStore";
import {
  attachPodcastToProjectItem,
  detachPodcastFromProjectItem,
} from "@/commands/podcast";
import {
  getProjectItemById,
  openProjectItemInNewWindow,
  removeChildProjectItem,
  removeRootProjectItem,
  updateProjectItem,
  updateWebLink,
} from "@/commands";
import useWhiteBoardStore from "@/stores/useWhiteBoardStore";
import {
  copyMarkdownToClipboard,
  copyWechatHtmlToClipboard,
  defaultProjectItemEventBus,
  downloadMarkdown,
  getMarkdown,
} from "@/utils";
import { EProjectItemType, ProjectItem, WhiteBoardContent } from "@/types";
import { TabType } from "@/types/tab";
import { useMemoizedFn } from "ahooks";
import { getProjectItemMoreMenuItems } from "./projectItemMoreMenuItems";

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
  options: UseProjectItemMoreActionsOptions,
): {
  moreMenuItems: MenuProps["items"];
  handleMoreMenuClick: MenuProps["onClick"];
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

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [epubExportModalOpen, setEpubExportModalOpen] = useState(false);
  const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);
  const [editTitleModalOpen, setEditTitleModalOpen] = useState(false);
  const [isPresentation, setIsPresentation] = useState(false);

  const darkMode = useSettingStore((state) => state.setting.darkMode);
  const navigateTo = useTabStore((state) => state.navigateTo);
  const openInNewTab = useTabStore((state) => state.openInNewTab);
  const panes = useTabStore((state) => state.panes);
  const activePaneId = useTabStore((state) => state.activePaneId);
  const projectItemEventBus = useMemo(
    () => defaultProjectItemEventBus.createEditor(),
    [],
  );
  const { modal, message: messageInstance } = App.useApp();
  const { message } = App.useApp();
  const { createWhiteBoard } = useWhiteBoardStore((state) => ({
    createWhiteBoard: state.createWhiteBoard,
  }));

  const {
    title: projectItemTitle,
    url: displayWebviewUrl,
    linkId: webLinkId,
  } = useProjectWebLinkMeta(projectItem);

  const moreMenuItems: MenuProps["items"] = useMemo(
    () => getProjectItemMoreMenuItems(projectItem),
    [projectItem?.projectItemType, projectItem?.refType, projectItem?.podcast],
  );

  const publishProjectItemUpdate = useMemoizedFn(
    (nextProjectItem: ProjectItem) => {
      onProjectItemChange?.(nextProjectItem);
      projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        nextProjectItem,
      );
    },
  );

  const flashcard = useFlashcardCreation({
    getContent: () => projectItem?.content || [],
    getReference: () => ({
      refType: "content",
      contentId: projectItem?.contentId || 0,
      title: projectItem?.title || "项目文档参考",
    }),
  });

  const {
    podcastModalOpen,
    openPodcastModal,
    closePodcastModal,
    handlePodcastSuccess,
  } = usePodcastAttachment({
    hostId: projectItem?.id || 0,
    currentPodcast: projectItem?.podcast,
    attachPodcast: attachPodcastToProjectItem,
    detachPodcast: detachPodcastFromProjectItem,
    reloadHost: getProjectItemById,
    onHostReloaded: publishProjectItemUpdate,
    message: messageInstance,
    messages: {
      created: "播客已添加到文档",
    },
  });

  const handleRemoveProjectItem = useMemoizedFn(async () => {
    if (!projectItem) return;
    modal.confirm({
      title: "删除项目文档",
      content: "确定删除该项目文档吗？",
      onOk: async () => {
        if (isRoot) {
          await removeRootProjectItem(projectId, projectItem.id);
          refreshProject?.();
        } else if (parentProjectItemId) {
          const [parentProjectItem] = await removeChildProjectItem(
            projectId,
            parentProjectItemId,
            projectItem.id,
          );
          if (parentProjectItem) {
            publishProjectItemUpdate(parentProjectItem);
          }
        }
        await reloadTree?.({ silent: true });
        if (activeItemId === projectItem.id) {
          navigateTo(TabType.ProjectDetail, {
            id: projectId,
            itemId: undefined,
          });
        }
      },
      okText: "确定",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
    });
  });

  const handleEditTitleConfirm = useMemoizedFn(
    async (result: { title: string }) => {
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
          }).catch((err) => console.error("更新网页标题失败:", err));
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
            projectItem.projectItemType === EProjectItemType.WebView
              ? textContent
              : nextTitle,
          );
        }
      }

      setEditTitleModalOpen(false);
    },
  );

  const handleMoreMenuClick: MenuProps["onClick"] = useMemoizedFn(
    async ({ key }) => {
      if (!projectItem) return;

      if (key === "to-card") {
        const freshProjectItem = await getProjectItemById(projectItem.id);
        if (!freshProjectItem) return;
        const { createCardFromProjectItem } = await import("@/commands");
        const createdCard = await createCardFromProjectItem(
          freshProjectItem.id,
        );
        const nextProjectItem = produce(freshProjectItem, (draft) => {
          draft.refId = createdCard.id;
          draft.refType = "card";
        });
        const updatedProjectItem = await updateProjectItem(nextProjectItem);
        if (!updatedProjectItem) return;
        publishProjectItemUpdate(updatedProjectItem);
        const { defaultCardEventBus } = await import("@/utils");
        defaultCardEventBus
          .createEditor()
          .publishCardEvent("card:created", createdCard);
        message.success("成功建立卡片");
      } else if (key === "to-white-board") {
        if (
          projectItem.projectItemType !== EProjectItemType.WhiteBoard ||
          !projectItem.whiteBoardContentId
        ) {
          return;
        }
        if (projectItem.refType === "white-board") return;
        const createWhiteBoardData = {
          title: projectItem.title,
          description: projectItem.title,
          tags: [],
          whiteBoardContentList: [
            {
              name: projectItem.title,
              data: {
                children: [],
                viewPort: {
                  zoom: 1,
                  minX: 0,
                  minY: 0,
                  width: 0,
                  height: 0,
                },
                selection: {
                  selectArea: null,
                  selectedElements: [],
                },
                presentationSequences: [],
              },
            } as Pick<WhiteBoardContent, "data" | "name">,
          ],
          snapshot: "",
        };
        try {
          const createdWhiteBoard =
            await createWhiteBoard(createWhiteBoardData);
          const nextProjectItem = produce(projectItem, (draft) => {
            draft.refId = createdWhiteBoard.id;
            draft.refType = "white-board";
          });
          const updatedProjectItem = await updateProjectItem(nextProjectItem);
          if (!updatedProjectItem) return;
          publishProjectItemUpdate(updatedProjectItem);
          message.success("成功创建白板");
        } catch (e) {
          console.error(e);
          message.error("创建白板失败");
        }
      } else if (key === "remove") {
        await handleRemoveProjectItem();
      } else if (key === "copy-markdown") {
        await copyMarkdownToClipboard(projectItem.content, messageInstance);
      } else if (key === "copy-wechat") {
        await copyWechatHtmlToClipboard(projectItem.content, messageInstance);
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
        let targetPaneId: string | undefined;
        if (panes.length > 1) {
          const otherPane = panes.find((p) => p.id !== activePaneId);
          targetPaneId = otherPane?.id;
        }

        if (projectItem.projectItemType === EProjectItemType.WebView) {
          if (displayWebviewUrl) {
            openInNewTab(
              TabType.WebView,
              { url: displayWebviewUrl },
              targetPaneId,
            );
          } else {
            message.error("无法提取 URL");
          }
        } else {
          openInNewTab(
            TabType.ProjectDetail,
            { id: projectId, itemId: projectItem.id },
            targetPaneId,
            projectItem.title || "项目",
          );
        }
      } else if (key === "manual-flashcard") {
        flashcard.openManualFlashcard();
      } else if (key === "ai-flashcard") {
        flashcard.openAiFlashcard();
      } else if (key === "generate-podcast") {
        openPodcastModal();
      }
    },
  );

  const moreActionModals = (
    <>
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
          flashcard.deckSelectorMode === "manual"
            ? "选择卡组 - 手动制卡"
            : "选择卡组 - AI 制卡"
        }
      />
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
