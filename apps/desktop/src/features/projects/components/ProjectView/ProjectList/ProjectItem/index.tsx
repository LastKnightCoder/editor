import { useState, useEffect, memo, useRef, useMemo } from "react";
import classnames from "classnames";
import { useCreation, useLocalStorageState, useMemoizedFn } from "ahooks";
import useUploadResource from "@/hooks/useUploadResource";
import { Dropdown, MenuProps, message, Tooltip } from "antd";
import {
  getFileBaseName,
  readTextFile,
  selectFile,
  getProjectItemById,
  getProjectItemsByIds,
  updateProjectItem,
  createEmptyVideoNote,
  createEmptyAudioNote,
  createWhiteBoardContent,
  addChildProjectItem,
  createDataTable,
  updateWebLink,
  moveProjectTreeItem,
} from "@/commands";
import { DEFAULT_COLUMNS, DEFAULT_ROWS } from "@/constants";
import useProjectWebLinkMeta from "@/hooks/useProjectWebLinkMeta";
import SelectWhiteBoardModal from "@/components/SelectWhiteBoardModal";
import SelectPdfModal from "@/components/SelectPdfModal";
import SelectEpubModal from "@/components/SelectEpubModal";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import useProjectsStore from "@/stores/useProjectsStore";
import useSettingStore from "@/stores/useSettingStore";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import useDragAndDrop, { EDragPosition, IDragItem } from "@/hooks/useDragAndDrop";
import useAddRefCard from "./useAddRefCard";
import useAddRefWhiteBoard from "../useAddRefWhiteBoard";
import useAddRefPdf from "./useAddRefPdf";
import useAddRefEpub from "./useAddRefEpub";
import { useProjectItemModalStates } from "../../shared/hooks/useProjectItemModalStates";
import { useWebLinkHandlers } from "../../shared/hooks/useWebLinkHandlers";
import { useVideoHandlers, createChildVideoStrategy } from "../../shared/hooks/useVideoHandlers";
import {
  usePdfHandlers,
  createChildPdfStrategy,
  createProjectItemFromPdf,
} from "../../shared/hooks/usePdfHandlers";
import {
  useEpubHandlers,
  createChildEpubStrategy,
  createProjectItemFromEpub,
} from "../../shared/hooks/useEpubHandlers";
import { useAudioHandlers, createChildAudioStrategy } from "../../shared/hooks/useAudioHandlers";
import { ADD_MENU_ITEMS } from "../../shared/constants/menuItems";
import { ModalKey } from "../../shared/constants/modalKeys";

import SVG from "react-inlinesvg";
import For from "@/components/For";
import {
  CreateProjectItem,
  EProjectItemType,
  ICard,
  WhiteBoard,
  type ProjectItem,
  IndexType,
  SearchResult,
  Pdf,
  Epub,
} from "@/types";
import usePdfsStore from "@/stores/usePdfsStore";
import useEpubsStore from "@/stores/useEpubsStore";
import { importLocalBook } from "../../shared/utils/bookImport";
import {
  FileOutlined,
  FolderOpenTwoTone,
  MoreOutlined,
  PlusOutlined,
  GlobalOutlined,
  VideoCameraOutlined,
  TableOutlined,
  FilePdfOutlined,
  BookOutlined,
} from "@ant-design/icons";
import {
  getContentLength,
  getEditorText,
  importFromMarkdown,
  defaultProjectItemEventBus,
} from "@/utils";
import whiteBoardIcon from "@/assets/icons/white-board.svg";

import EditText, { EditTextHandle } from "@/components/EditText";
import { useProjectContext } from "../../ProjectContext";
import { useThemeColors } from "@/hooks";
import YoutubeVideoSelectModal from "@/components/YoutubeVideoSelectModal";
import BilibiliVideoSelectModal from "@/components/BilibiliVideoSelectModal";
import RemoteVideoSelectModal from "@/components/RemoteVideoSelectModal";
import RemotePdfSelectModal from "@/components/RemotePdfSelectModal";
import RemoteEpubSelectModal from "@/components/RemoteEpubSelectModal";
import RemoteAudioSelectModal from "@/components/RemoteAudioSelectModal";
import XiaoyuzhouInput from "../../AudioNoteView/components/XiaoyuzhouInput";
import WebViewSelectModal, { type WebViewSelectResult } from "@/components/WebViewSelectModal";

import { createProjectCardListExtension } from "@/editor-extensions";
import useProjectItemMoreActions from "./useProjectItemMoreActions";

const TOP_DROP_INDICATOR_CLASS = [
  "before:content-['']",
  "before:absolute",
  "before:left-[2px]",
  "before:[top:-2px]",
  "before:h-[2px]",
  "before:w-[calc(100%-4px)]",
  "before:bg-[var(--th-active-text)]",
  "after:content-['']",
  "after:absolute",
  "after:[top:-5px]",
  "after:left-0",
  "after:border-[4px]",
  "after:border-transparent",
  "after:[border-left-color:var(--th-active-text)]",
].join(" ");

const BOTTOM_DROP_INDICATOR_CLASS = [
  "before:content-['']",
  "before:absolute",
  "before:left-[2px]",
  "before:[bottom:-2px]",
  "before:h-[2px]",
  "before:w-[calc(100%-4px)]",
  "before:bg-[var(--th-active-text)]",
  "after:content-['']",
  "after:absolute",
  "after:[bottom:-5px]",
  "after:left-0",
  "after:border-[4px]",
  "after:border-transparent",
  "after:[border-left-color:var(--th-active-text)]",
].join(" ");

const INSIDE_DROP_INDICATOR_CLASS = [
  "border",
  "border-dashed",
  "border-[var(--th-active-text)]",
  "bg-[var(--th-accent-soft)]",
].join(" ");

interface IProjectItemProps {
  projectItemId: number;
  parentProjectItemId: number;
  isRoot?: boolean;
  path: number[];
  parentChildren: number[];
  cards: ICard[];
  whiteBoards: WhiteBoard[];
  pdfs: Pdf[];
  epubs: Epub[];
  onOpenChange?: (open: boolean) => void;
  refreshProject?: () => void;
}

const ProjectItem = memo((props: IProjectItemProps) => {
  const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
  const {
    projectItemId,
    isRoot = false,
    parentProjectItemId,
    path,
    parentChildren,
    cards,
    whiteBoards,
    pdfs,
    epubs,
    onOpenChange,
    refreshProject,
  } = props;

  const extensions = useCreation(() => {
    return [...dynamicExtensions, createProjectCardListExtension(projectItemId)];
  }, [projectItemId, dynamicExtensions]);

  const projectItemEventBus = useCreation(() => defaultProjectItemEventBus.createEditor(), []);
  const uploadResource = useUploadResource();

  const { projectId, itemId, setActiveItemId } = useProjectContext();
  const databaseName = useSettingStore.getState().setting.database.active;
  const { hoverClass, activeClass, borderClass } = useThemeColors();

  const [titleEditable, setTitleEditable] = useState(false);
  const titleRef = useRef<EditTextHandle>(null);
  const [projectItem, setProjectItem] = useState<ProjectItem>();
  const [folderOpen, setFolderOpen] = useLocalStorageState<boolean>(
    `project-item-${databaseName}-${projectItemId}`,
    {
      defaultValue: () => {
        return path.length === 1;
      },
    }
  );

  const { modalStates, openModal, closeModal } = useProjectItemModalStates();
  const { createWebLinkRecord, handleSelectWebviewFile } = useWebLinkHandlers({
    uploadResource,
    messageKeyPrefix: "project-item",
  });

  const videoStrategy = useMemo(
    () =>
      createChildVideoStrategy({
        projectItem,
        projectId,
        addChildProjectItem,
        setProjectItem,
        projectItemEventBus,
      }),
    [projectItem, projectId, projectItemEventBus]
  );

  const pdfStrategy = useMemo(
    () =>
      createChildPdfStrategy({
        projectItem,
        projectId,
        addChildProjectItem,
        setProjectItem,
        projectItemEventBus,
      }),
    [projectItem, projectId, projectItemEventBus]
  );

  const epubStrategy = useMemo(
    () =>
      createChildEpubStrategy({
        projectItem,
        projectId,
        addChildProjectItem,
        setProjectItem,
        projectItemEventBus,
      }),
    [projectItem, projectId, projectItemEventBus]
  );

  const { handleYoutubeConfirm, handleBilibiliConfirm, handleRemoteVideoConfirm } =
    useVideoHandlers({
      closeModal,
      strategy: videoStrategy,
    });

  const { handleRemotePdfConfirm, handleSelectPdfConfirm } = usePdfHandlers({
    closeModal,
    strategy: pdfStrategy,
  });

  const { handleRemoteEpubConfirm, handleSelectEpubConfirm } = useEpubHandlers({
    closeModal,
    strategy: epubStrategy,
  });

  const audioStrategy = useMemo(
    () =>
      createChildAudioStrategy({
        projectItem,
        projectId,
        addChildProjectItem,
        setProjectItem,
        projectItemEventBus,
      }),
    [projectItem, projectId, projectItemEventBus]
  );

  const {
    handleRemoteAudioConfirm,
    handleXiaoyuzhouConfirm,
    handleBilibiliAudioConfirm,
    handleYoutubeAudioConfirm,
  } = useAudioHandlers({
    closeModal,
    strategy: audioStrategy,
  });

  const {
    title: projectItemTitle,
    url: displayWebviewUrl,
    linkId: webLinkId,
  } = useProjectWebLinkMeta(projectItem);

  useEffect(() => {
    if (itemId === projectItemId) {
      setFolderOpen(true);
      onOpenChange?.(true);
    }
  }, [itemId]);

  const onChildOpenChange = useMemoizedFn((open: boolean) => {
    if (open) {
      setFolderOpen(true);
    }
  });

  const {
    selectCardModalOpen,
    openSelectCardModal,
    excludeCardIds,
    onOk: onCardOk,
    onCancel: onCardCancel,
  } = useAddRefCard(cards, projectId, projectItem);
  const {
    selectWhiteBoardModalOpen,
    openSelectWhiteBoardModal,
    selectedWhiteBoards,
    excludeWhiteBoardIds,
    onOk: onWhiteBoardOk,
    onCancel: onWhiteBoardCancel,
    onChange: onWhiteBoardChange,
    multiple,
  } = useAddRefWhiteBoard(whiteBoards, projectId, projectItem);

  const handleOnSelectWhiteboardOk = useMemoizedFn(async (whiteBoards: WhiteBoard[]) => {
    const res = await onWhiteBoardOk(whiteBoards);
    if (res) {
      const [parentProjectItem] = res;
      if (parentProjectItem) {
        setProjectItem(parentProjectItem as ProjectItem);
        projectItemEventBus.publishProjectItemEvent(
          "project-item:updated",
          parentProjectItem as ProjectItem
        );
      }
    }
  });

  const {
    selectPdfModalOpen,
    openSelectPdfModal,
    selectedPdfId,
    onSelect: onPdfSelect,
    excludePdfIds,
    onOk: onSelectPdfOk,
    onCancel: onSelectPdfCancel,
  } = useAddRefPdf(pdfs, {
    modalStates,
    openModal,
    closeModal,
    onConfirm: handleSelectPdfConfirm,
    projectItem,
  });

  const {
    selectEpubModalOpen,
    openSelectEpubModal,
    selectedEpubId,
    onSelect: onEpubSelect,
    excludeEpubIds,
    onOk: onSelectEpubOk,
    onCancel: onSelectEpubCancel,
  } = useAddRefEpub(epubs, {
    modalStates,
    openModal,
    closeModal,
    onConfirm: handleSelectEpubConfirm,
    projectItem,
  });

  const handleWebviewConfirm = useMemoizedFn(async (result: WebViewSelectResult) => {
    if (!projectItem || !projectId) {
      message.error("项目文档尚未加载完成");
      return;
    }

    try {
      const webLink = await createWebLinkRecord(result.title, result.url, result.sourceType);

      const createProjectItem: CreateProjectItem = {
        title: webLink.title,
        content: [],
        children: [],
        refType: "web-link",
        refId: webLink.id,
        projectItemType: EProjectItemType.WebView,
        count: 0,
        whiteBoardContentId: 0,
      };

      const [parentProjectItem] = await addChildProjectItem(projectItem.id, createProjectItem);

      if (parentProjectItem) {
        setProjectItem(parentProjectItem);
        projectItemEventBus.publishProjectItemEvent("project-item:updated", parentProjectItem);
      }

      closeModal(ModalKey.Webview);
      message.success("网页添加成功");
    } catch (error) {
      console.error("添加网页失败:", error);
      message.error("添加网页失败");
    }
  });

  const refresh = useMemoizedFn(projectItemId => {
    getProjectItemById(projectItemId).then(projectItem => {
      if (projectItem) {
        setProjectItem(projectItem);
      }
    });
  });

  useEffect(() => {
    refresh(projectItemId);
  }, [refresh, projectItemId]);

  useEffect(() => {
    const unsubscribe = projectItemEventBus.subscribeToProjectItemWithId(
      "project-item:updated",
      projectItemId,
      data => {
        setProjectItem(data.projectItem);
        titleRef.current?.setValue(data.projectItem.title);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [projectItemId, projectItemEventBus]);

  const onDrop = useMemoizedFn(async (dragItem: IDragItem, dragPosition: EDragPosition) => {
    if (!projectItem || !projectId) return;
    const cleanDragItem: IDragItem = {
      itemId: dragItem.itemId,
      parentId: dragItem.parentId,
      isRoot: dragItem.isRoot,
      path: dragItem.path,
      children: dragItem.children,
      parentChildren: dragItem.parentChildren,
    };

    try {
      useProjectsStore.setState({
        dragging: true,
      });
      const result = await moveProjectTreeItem(projectId, {
        dragItem: cleanDragItem,
        dropTargetId: projectItemId,
        dropTargetParentId: parentProjectItemId,
        dropTargetIsRoot: isRoot,
        dragPosition,
      });
      if (!result) {
        message.warning("移动失败，目标位置可能已变化");
        return;
      }
      const needRefreshId = [...result.refreshItemIds];
      if (dragItem.isRoot || (dragPosition !== EDragPosition.Inside && isRoot)) {
        refreshProject?.();
      }
      if (
        itemId &&
        [dragItem.itemId, dragItem.parentId, projectItemId, parentProjectItemId].includes(itemId)
      ) {
        needRefreshId.push(itemId);
      }
      const updatedProjectItems = await getProjectItemsByIds([...new Set(needRefreshId)]);
      updatedProjectItems.forEach(updatedProjectItem => {
        if (!updatedProjectItem) return;
        defaultProjectItemEventBus
          .createEditor()
          .publishProjectItemEvent("project-item:updated", updatedProjectItem);
      });
    } finally {
      useProjectsStore.setState({
        dragging: false,
      });
    }
  });

  const { drag, drop, isDragging, dropContainerRef, dragPosition, isOver, canDrop } =
    useDragAndDrop({
      itemId: projectItemId,
      parentId: parentProjectItemId,
      isRoot,
      path,
      onDrop,
      children: projectItem?.children || [],
      parentChildren,
      chatContentReference: projectItem?.contentId
        ? {
            entityType: "project-item",
            entityId: projectItem.id,
            contentId: projectItem.contentId,
            title:
              (projectItem.projectItemType === EProjectItemType.WebView
                ? projectItemTitle
                : projectItem.title) || `项目文档 #${projectItem.id}`,
            previewText: getEditorText(projectItem.content, 160),
          }
        : undefined,
    });

  const { moreMenuItems, handleMoreMenuClick, moreActionModals } = useProjectItemMoreActions({
    projectId,
    projectItem,
    parentProjectItemId,
    isRoot,
    activeItemId: itemId,
    onProjectItemChange: setProjectItem,
    refreshProject,
    getTitleHandle: () => titleRef.current,
    onRequestInlineTitleEdit: () => {
      setTitleEditable(true);
      requestAnimationFrame(() => {
        titleRef.current?.setContentEditable(true);
        titleRef.current?.selectAll();
      });
    },
  });

  const handleAddMenuClick: MenuProps["onClick"] = useMemoizedFn(async ({ key }) => {
    if (key === "add-project-item") {
      if (!projectItemId) return;
      const createProjectItem: CreateProjectItem = {
        title: "新文档",
        content: [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "" }],
          },
        ],
        children: [],
        refType: "",
        refId: 0,
        projectItemType: EProjectItemType.Document,
        count: 0,
        whiteBoardContentId: 0,
      };
      const [parentProjectItem] = await addChildProjectItem(projectItemId, createProjectItem);
      if (parentProjectItem) {
        setProjectItem(parentProjectItem);
        projectItemEventBus.publishProjectItemEvent("project-item:updated", parentProjectItem);
      }
    } else if (key === "add-white-board-project-item") {
      if (!projectItemId) return;
      const whiteBoardContent = await createWhiteBoardContent({
        name: "新白板",
        imgUrl: "",
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
      });
      const createProjectItem: CreateProjectItem = {
        title: "新白板",
        content: [],
        whiteBoardContentId: whiteBoardContent.id,
        children: [],
        refType: "",
        refId: 0,
        projectItemType: EProjectItemType.WhiteBoard,
        count: 0,
      };
      const [parentProjectItem] = await addChildProjectItem(projectItemId, createProjectItem);
      if (parentProjectItem) {
        setProjectItem(parentProjectItem);
        projectItemEventBus.publishProjectItemEvent("project-item:updated", parentProjectItem);
      }
    } else if (key === "add-local-video-note-project-item") {
      // 选择视频文件
      const filePath = await selectFile({
        properties: ["openFile"],
        filters: [
          {
            name: "Video",
            extensions: ["mp4", "mov", "avi", "mkv", "flv", "wmv", "webm"],
          },
        ],
      });
      if (!filePath) return;
      const item = await createEmptyVideoNote({
        type: "local",
        filePath: filePath[0],
      });
      if (!item) {
        message.error("创建视频失败");
        return;
      }
      const fileName = await getFileBaseName(filePath[0], true);
      const createProjectItem: CreateProjectItem = {
        title: fileName,
        content: [],
        children: [],
        refType: "video-note",
        refId: item.id,
        projectItemType: EProjectItemType.VideoNote,
        count: 0,
        whiteBoardContentId: 0,
      };
      const [parentProjectItem] = await addChildProjectItem(projectItemId, createProjectItem);
      if (parentProjectItem) {
        setProjectItem(parentProjectItem);
        projectItemEventBus.publishProjectItemEvent("project-item:updated", parentProjectItem);
      }
    } else if (key === "add-remote-video-note-project-item") {
      openModal(ModalKey.WebVideo);
    } else if (key === "add-bilibili-video-note-project-item") {
      openModal(ModalKey.Bilibili);
    } else if (key === "add-youtube-video-note-project-item") {
      openModal(ModalKey.Youtube);
    } else if (key === "add-local-audio-note-project-item") {
      const filePath = await selectFile({
        properties: ["openFile"],
        filters: [
          {
            name: "Audio",
            extensions: ["mp3", "wav", "m4a", "flac", "ogg", "aac", "wma"],
          },
        ],
      });
      if (!filePath) return;
      const audioNote = await createEmptyAudioNote({
        type: "local",
        filePath: filePath[0],
      });
      if (!audioNote) {
        message.error("创建音频笔记失败");
        return;
      }
      const audioFileName = await getFileBaseName(filePath[0], true);
      const createAudioProjectItem: CreateProjectItem = {
        title: audioFileName,
        content: [],
        children: [],
        refType: "audio-note",
        refId: audioNote.id,
        projectItemType: EProjectItemType.AudioNote,
        count: 0,
        whiteBoardContentId: 0,
      };
      const [parentItem] = await addChildProjectItem(projectItemId, createAudioProjectItem);
      if (parentItem) {
        setProjectItem(parentItem);
        projectItemEventBus.publishProjectItemEvent("project-item:updated", parentItem);
      }
    } else if (key === "add-remote-audio-note-project-item") {
      openModal(ModalKey.RemoteAudio);
    } else if (key === "add-xiaoyuzhou-audio-note-project-item") {
      openModal(ModalKey.XiaoyuzhouPodcast);
    } else if (key === "add-bilibili-audio-note-project-item") {
      openModal(ModalKey.BilibiliAudio);
    } else if (key === "add-youtube-audio-note-project-item") {
      openModal(ModalKey.YoutubeAudio);
    } else if (key === "add-webview-project-item") {
      openModal(ModalKey.Webview);
    } else if (key === "add-table-project-item") {
      if (!projectItemId) return;
      const dataTable = await createDataTable({
        columns: DEFAULT_COLUMNS,
        rows: DEFAULT_ROWS,
        activeViewId: null,
      });
      const createProjectItem: CreateProjectItem = {
        title: "新表格",
        content: [],
        children: [],
        refType: "data-table",
        refId: dataTable.id,
        projectItemType: EProjectItemType.TableView,
        count: 0,
        whiteBoardContentId: 0,
      };
      const [parentProjectItem] = await addChildProjectItem(projectItemId, createProjectItem);
      if (parentProjectItem) {
        setProjectItem(parentProjectItem);
        projectItemEventBus.publishProjectItemEvent("project-item:updated", parentProjectItem);
      }
    } else if (key === "add-local-pdf-project-item") {
      try {
        const fileInfo = await importLocalBook("pdf");
        if (!fileInfo) return;
        const pdf = await usePdfsStore.getState().createPdf({
          fileName: fileInfo.fileName,
          filePath: fileInfo.filePath,
          isLocal: true,
          remoteUrl: "",
          tags: [],
          category: "",
        });
        await pdfStrategy.addProjectItem(createProjectItemFromPdf(pdf));
        message.success("本地 PDF 添加成功");
      } catch (error) {
        console.error("添加本地 PDF 失败:", error);
        message.error("添加本地 PDF 失败");
      }
    } else if (key === "add-remote-pdf-project-item") {
      openModal(ModalKey.RemotePdf);
    } else if (key === "link-pdf-project-item") {
      openSelectPdfModal();
    } else if (key === "add-local-epub-project-item") {
      try {
        const fileInfo = await importLocalBook("epub");
        if (!fileInfo) return;
        const epub = await useEpubsStore.getState().createEpub({
          fileName: fileInfo.fileName,
          filePath: fileInfo.filePath,
          isLocal: true,
          remoteUrl: "",
          tags: [],
          category: "default",
          progressPercentage: 0,
        });
        await epubStrategy.addProjectItem(createProjectItemFromEpub(epub));
        message.success("本地 EPUB 添加成功");
      } catch (error) {
        console.error("添加本地 EPUB 失败:", error);
        message.error("添加本地 EPUB 失败");
      }
    } else if (key === "add-remote-epub-project-item") {
      openModal(ModalKey.RemoteEpub);
    } else if (key === "link-epub-project-item") {
      openSelectEpubModal();
    } else if (key === "link-card-project-item") {
      openSelectCardModal();
    } else if (key === "link-white-board-project-item") {
      openSelectWhiteBoardModal();
    } else if (key === "import-markdown") {
      if (!projectItem) return;
      const filePath = await selectFile({
        properties: ["openFile", "multiSelections"],
        filters: [
          {
            name: "Markdown",
            extensions: ["md"],
          },
        ],
      }).catch(e => {
        console.error(e);
        return null;
      });
      if (!filePath) return;
      for (const path of filePath) {
        const markdown = await readTextFile(path);
        const content = importFromMarkdown(markdown, ["yaml"]);
        const fileName = await getFileBaseName(path, true);
        const [parentProjectItem] = await addChildProjectItem(projectItemId, {
          title: fileName,
          content,
          children: [],
          refType: "",
          refId: 0,
          projectItemType: EProjectItemType.Document,
          count: getContentLength(content),
          whiteBoardContentId: 0,
        });
        if (parentProjectItem) {
          setProjectItem(parentProjectItem);
          projectItemEventBus.publishProjectItemEvent("project-item:updated", parentProjectItem);
        }
      }
    }
  });

  const initialCardContents = useMemo(() => {
    return cards.map(card => ({
      id: card.id,
      contentId: card.contentId,
      type: "card" as IndexType,
      title: "",
      content: card.content,
      source: "fts" as "fts" | "vec-document",
      updateTime: card.update_time,
    }));
  }, [cards]);

  const handleCardSelect = async (selectedResults: SearchResult | SearchResult[]) => {
    const results = Array.isArray(selectedResults) ? selectedResults : [selectedResults];
    const selectedCardIds = results.map(result => result.id);
    const newSelectedCards = selectedCardIds
      .map(id => cards.find(card => card.id === id))
      .filter((card): card is ICard => !!card);

    const res = await onCardOk(newSelectedCards);
    if (res) {
      const [parentProjectItem] = res;
      if (parentProjectItem) {
        setProjectItem(parentProjectItem as ProjectItem);
        projectItemEventBus.publishProjectItemEvent(
          "project-item:updated",
          parentProjectItem as ProjectItem
        );
      }
    }
  };

  if (!projectItem) return null;

  return (
    <>
      <div
        ref={node => {
          drag(node);
        }}
        className={classnames("transition-opacity", {
          "opacity-50": isDragging,
        })}
      >
        <div
          ref={node => {
            dropContainerRef.current = node;
            drop(node);
          }}
          className={classnames(
            "relative flex min-w-0 cursor-pointer items-center justify-between rounded-[8px] border border-transparent px-[8px] py-[4px] transition-all duration-200",
            {
              [activeClass]: itemId === projectItem.id,
              [hoverClass]: itemId !== projectItem.id,
              [TOP_DROP_INDICATOR_CLASS]: isOver && canDrop && dragPosition === EDragPosition.Top,
              [BOTTOM_DROP_INDICATOR_CLASS]:
                isOver && canDrop && dragPosition === EDragPosition.Bottom,
              [INSIDE_DROP_INDICATOR_CLASS]:
                isOver && canDrop && dragPosition === EDragPosition.Inside,
            }
          )}
          onClick={async () => {
            const activeProjectItem = await getProjectItemById(projectItem.id);
            if (!activeProjectItem) return;
            setActiveItemId?.(projectItem.id);
          }}
        >
          <div className="flex min-h-[30px] min-w-0 flex-1 items-center gap-[8px] overflow-hidden">
            <Tooltip
              title={projectItem.children.length > 0 ? (folderOpen ? "收起" : "展开") : undefined}
              mouseEnterDelay={1}
            >
              <div
                className={classnames(
                  "flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full transition-colors duration-200",
                  {
                    [`cursor-pointer ${hoverClass}`]: projectItem.children.length > 0,
                  }
                )}
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (projectItem.children.length === 0) return;
                  setFolderOpen(!folderOpen);
                }}
              >
                {projectItem.children.length > 0 ? (
                  <FolderOpenTwoTone />
                ) : projectItem.projectItemType === EProjectItemType.WhiteBoard ? (
                  <SVG src={whiteBoardIcon} />
                ) : projectItem.projectItemType === EProjectItemType.VideoNote ? (
                  <VideoCameraOutlined />
                ) : projectItem.projectItemType === EProjectItemType.WebView ? (
                  <GlobalOutlined />
                ) : projectItem.projectItemType === EProjectItemType.TableView ? (
                  <TableOutlined />
                ) : projectItem.projectItemType === EProjectItemType.Pdf ? (
                  <FilePdfOutlined className="text-red-500" />
                ) : projectItem.projectItemType === EProjectItemType.Epub ? (
                  <BookOutlined />
                ) : (
                  <FileOutlined />
                )}
              </div>
            </Tooltip>
            <div className="min-w-0 flex-1 overflow-hidden">
              <Tooltip
                title={
                  projectItem.projectItemType === EProjectItemType.WebView
                    ? projectItemTitle
                    : projectItem.title
                }
                mouseEnterDelay={1}
                trigger={"hover"}
              >
                <div className="w-full min-w-0">
                  <EditText
                    className={classnames("w-full min-w-0 max-w-full truncate leading-[32px]", {
                      [`rounded border ${borderClass} whitespace-normal px-2`]: titleEditable,
                    })}
                    key={projectItem.id}
                    ref={titleRef}
                    defaultValue={
                      projectItem.projectItemType === EProjectItemType.WebView
                        ? projectItemTitle
                        : projectItem.title
                    }
                    contentEditable={titleEditable}
                    onPressEnter={() => {
                      const textContent =
                        titleRef.current?.getValue() ||
                        (projectItem.projectItemType === EProjectItemType.WebView
                          ? projectItemTitle
                          : projectItem?.title) ||
                        "";
                      setTitleEditable(false);

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
                        updateProjectItem({
                          ...projectItem,
                          title: nextTitle,
                        }).then(newProjectItem => {
                          if (!newProjectItem) return;
                          setProjectItem(newProjectItem);
                          setTitleEditable(false);
                          titleRef.current?.setContentEditable(false);
                          projectItemEventBus.publishProjectItemEvent(
                            "project-item:updated",
                            newProjectItem
                          );
                        });
                      }
                    }}
                  />
                </div>
              </Tooltip>
            </div>
          </div>
          <div
            onClick={e => {
              e.stopPropagation();
            }}
            className="flex flex-none items-center"
          >
            <Dropdown
              menu={{
                items: moreMenuItems,
                onClick: handleMoreMenuClick,
              }}
            >
              <div
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ${hoverClass}`}
              >
                <MoreOutlined />
              </div>
            </Dropdown>
            <Dropdown
              menu={{
                items: ADD_MENU_ITEMS,
                onClick: handleAddMenuClick,
              }}
            >
              <div
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ${hoverClass}`}
              >
                <PlusOutlined />
              </div>
            </Dropdown>
          </div>
        </div>
        <div
          className={classnames(
            "grid overflow-hidden transition-[grid-template-rows] duration-300",
            {
              "grid-rows-[1fr]": folderOpen && projectItem.children.length > 0,
              "my-0 grid-rows-[0fr]": !folderOpen || projectItem.children.length === 0,
            }
          )}
        >
          <div className="flex min-h-0 w-full min-w-0 flex-col gap-[4px] pl-[16px]">
            <For
              data={projectItem.children}
              renderItem={(projectItemId, index) => (
                <ProjectItem
                  key={projectItemId}
                  projectItemId={projectItemId}
                  parentProjectItemId={projectItem.id}
                  isRoot={false}
                  path={[...path, index]}
                  parentChildren={projectItem.children}
                  cards={cards}
                  whiteBoards={whiteBoards}
                  pdfs={pdfs}
                  epubs={epubs}
                  onOpenChange={onChildOpenChange}
                  refreshProject={refreshProject}
                />
              )}
            />
          </div>
        </div>
      </div>
      <ContentSelectorModal
        title={"选择关联卡片"}
        open={selectCardModalOpen}
        onCancel={onCardCancel}
        onSelect={handleCardSelect}
        contentType="card"
        multiple={false}
        excludeIds={excludeCardIds}
        initialContents={initialCardContents}
        extensions={extensions}
      />
      <SelectWhiteBoardModal
        title={"选择关联白板"}
        selectedWhiteBoards={selectedWhiteBoards}
        onChange={onWhiteBoardChange}
        open={selectWhiteBoardModalOpen}
        allWhiteBoards={whiteBoards}
        onCancel={onWhiteBoardCancel}
        onOk={handleOnSelectWhiteboardOk}
        excludeWhiteBoardIds={excludeWhiteBoardIds}
        multiple={multiple}
      />
      <SelectPdfModal
        open={selectPdfModalOpen}
        pdfs={pdfs}
        selectedPdfId={selectedPdfId}
        onSelect={onPdfSelect}
        onOk={onSelectPdfOk}
        onCancel={onSelectPdfCancel}
        excludePdfIds={excludePdfIds}
      />
      <SelectEpubModal
        open={selectEpubModalOpen}
        epubs={epubs}
        selectedEpubId={selectedEpubId}
        onSelect={onEpubSelect}
        onOk={onSelectEpubOk}
        onCancel={onSelectEpubCancel}
        excludeEpubIds={excludeEpubIds}
      />
      <RemoteVideoSelectModal
        open={modalStates.webVideo}
        onCancel={() => closeModal(ModalKey.WebVideo)}
        onConfirm={handleRemoteVideoConfirm}
      />
      <RemotePdfSelectModal
        open={modalStates.remotePdf}
        onCancel={() => closeModal(ModalKey.RemotePdf)}
        onConfirm={handleRemotePdfConfirm}
      />
      <RemoteEpubSelectModal
        open={modalStates.remoteEpub}
        onCancel={() => closeModal(ModalKey.RemoteEpub)}
        onConfirm={handleRemoteEpubConfirm}
      />

      <WebViewSelectModal
        open={modalStates.webview}
        onCancel={() => closeModal(ModalKey.Webview)}
        onSelectFile={handleSelectWebviewFile}
        onConfirm={handleWebviewConfirm}
      />

      <BilibiliVideoSelectModal
        open={modalStates.bilibili}
        onCancel={() => closeModal(ModalKey.Bilibili)}
        onConfirm={handleBilibiliConfirm}
      />

      <YoutubeVideoSelectModal
        open={modalStates.youtube}
        onCancel={() => closeModal(ModalKey.Youtube)}
        onConfirm={handleYoutubeConfirm}
      />

      <RemoteAudioSelectModal
        open={modalStates.remoteAudio}
        onCancel={() => closeModal(ModalKey.RemoteAudio)}
        onConfirm={handleRemoteAudioConfirm}
      />

      <XiaoyuzhouInput
        open={modalStates.xiaoyuzhouPodcast}
        onClose={() => closeModal(ModalKey.XiaoyuzhouPodcast)}
        onConfirm={handleXiaoyuzhouConfirm}
      />

      <BilibiliVideoSelectModal
        open={modalStates.bilibiliAudio}
        onCancel={() => closeModal(ModalKey.BilibiliAudio)}
        onConfirm={handleBilibiliAudioConfirm}
      />

      <YoutubeVideoSelectModal
        open={modalStates.youtubeAudio}
        onCancel={() => closeModal(ModalKey.YoutubeAudio)}
        onConfirm={handleYoutubeAudioConfirm}
      />

      {moreActionModals}
    </>
  );
});

export default ProjectItem;
