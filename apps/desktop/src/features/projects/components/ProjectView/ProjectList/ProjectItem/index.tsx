import { ProjectReviewSlot } from "../../../../review/ProjectReviewContext";
import { useState, useEffect, memo, useRef, useMemo } from "react";
import classnames from "classnames";
import { useCreation, useMemoizedFn } from "ahooks";
import useUploadResource from "@/hooks/useUploadResource";
import {
  getFileBaseName,
  selectFile,
  getProjectItemById,
  getProjectItemsByIds,
  updateProjectItem,
  createEmptyVideoNote,
  createWhiteBoardContent,
  addChildProjectItem,
  createDataTable,
  updateWebLink,
  moveProjectTreeItem,
} from "@/commands";
import { DEFAULT_COLUMNS, DEFAULT_ROWS } from "@/constants";
import useProjectWebLinkMeta from "@/hooks/useProjectWebLinkMeta";
import SelectWhiteBoardModal from "@/components/SelectWhiteBoardModal";
import { SelectPdfDialog } from "@/features/pdfs/components/SelectPdfDialog";
import { useCreatePdfRecord } from "@/features/pdfs/queries";
import { WHITEBOARD_DOCUMENT_VERSION } from "@tau/whiteboard";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import { useDraggingStore } from "@/stores/useDraggingStore";
import useSettingStore from "@/stores/useSettingStore";
import {
  useProjectTreeExpandedStore,
  openEntryKey,
  readPersistedOpen,
} from "@/features/projects/projectTreeExpandedStore";
import useDragAndDrop, { EDragPosition, IDragItem } from "@/hooks/useDragAndDrop";
import useAddRefCard from "./useAddRefCard";
import useAddRefWhiteBoard from "../useAddRefWhiteBoard";
import useAddRefPdf from "./useAddRefPdf";
import { useProjectItemModalStates } from "../../shared/hooks/useProjectItemModalStates";
import { useWebLinkHandlers } from "../../shared/hooks/useWebLinkHandlers";
import { useVideoHandlers, createChildVideoStrategy } from "../../shared/hooks/useVideoHandlers";
import {
  usePdfHandlers,
  createChildPdfStrategy,
  createProjectItemFromPdf,
} from "../../shared/hooks/usePdfHandlers";
import { ADD_MENU_ITEMS } from "../../shared/constants/menuItems";
import { renderMenuEntries } from "../../shared/menuEntries";
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
} from "@/types";
import { importLocalPdf } from "../../shared/utils/bookImport";
import {
  BookMarked,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Globe,
  Video,
  Table,
} from "lucide-react";
import { getContentLength, getEditorText, defaultProjectItemEventBus } from "@/utils";
import whiteBoardIcon from "@/assets/icons/white-board.svg";

import { EditText, EditTextHandle } from "@tau/ui";
import { useProjectContext } from "../../ProjectContext";
import { usePage } from "@/page/PageProvider";
import YoutubeVideoSelectModal from "@/components/YoutubeVideoSelectModal";
import BilibiliVideoSelectModal from "@/components/BilibiliVideoSelectModal";
import RemoteVideoSelectModal from "@/components/RemoteVideoSelectModal";
import RemotePdfSelectModal from "@/components/RemotePdfSelectModal";
import WebViewSelectModal, { type WebViewSelectResult } from "@/components/WebViewSelectModal";

import { createProjectCardListExtension } from "@/editor-extensions";
import useProjectItemMoreActions from "./useProjectItemMoreActions";
import { toast, Tooltip, Menu } from "@tau/ui";
import { importMarkdownFiles } from "@/services/content-transfer";

const TOP_DROP_INDICATOR_CLASS = [
  "before:content-['']",
  "before:absolute",
  "before:left-[2px]",
  "before:[top:-2px]",
  "before:h-[2px]",
  "before:w-[calc(100%-4px)]",
  "before:bg-accent-text",
  "after:content-['']",
  "after:absolute",
  "after:[top:-5px]",
  "after:left-0",
  "after:border-[4px]",
  "after:border-transparent",
  "after:border-l-accent-text",
].join(" ");

const BOTTOM_DROP_INDICATOR_CLASS = [
  "before:content-['']",
  "before:absolute",
  "before:left-[2px]",
  "before:[bottom:-2px]",
  "before:h-[2px]",
  "before:w-[calc(100%-4px)]",
  "before:bg-accent-text",
  "after:content-['']",
  "after:absolute",
  "after:[bottom:-5px]",
  "after:left-0",
  "after:border-[4px]",
  "after:border-transparent",
  "after:border-l-accent-text",
].join(" ");

const INSIDE_DROP_INDICATOR_CLASS = [
  "border",
  "border-dashed",
  "border-accent-text",
  "bg-accent-soft",
].join(" ");

// 引导线落在父级折叠箭头的中轴：行左内边距 4px + 边框 1px + 箭头半宽 8px
const GUIDE_LINE_CLASS = [
  "before:content-['']",
  "before:absolute",
  "before:left-[13px]",
  "before:top-0",
  "before:bottom-[4px]",
  "before:w-px",
  "before:transition-colors",
].join(" ");

// 层级色只分两档，更深层回到中性，避免与选中态的强调色争抢
const getFolderToneClass = (depth: number) => {
  if (depth === 0) return "text-accent-text fill-accent-soft";
  if (depth === 1) return "text-accent-text/60";
  return "text-ink-2";
};

const getGuideToneClass = (depth: number, onActivePath: boolean) => {
  if (onActivePath) return "before:bg-accent";
  if (depth === 0) return "before:bg-accent/30";
  if (depth === 1) return "before:bg-accent/15";
  return "before:bg-line-1 group-hover/tree:before:bg-ink-3/40";
};

interface IProjectItemProps {
  projectItemId: number;
  parentProjectItemId: number;
  isRoot?: boolean;
  path: number[];
  parentChildren: number[];
  cards: ICard[];
  whiteBoards: WhiteBoard[];
  /** 当前激活文档的祖先集合，用于高亮其所在分支的引导线 */
  activeAncestorIds?: ReadonlySet<number>;
  onOpenChange?: (open: boolean) => void;
  refreshProject?: () => void;
}

const ProjectItem = memo((props: IProjectItemProps) => {
  const {
    projectItemId,
    isRoot = false,
    parentProjectItemId,
    path,
    parentChildren,
    cards,
    whiteBoards,
    activeAncestorIds,
    onOpenChange,
    refreshProject,
  } = props;

  const extensions = useCreation(() => {
    return [createProjectCardListExtension(projectItemId)];
  }, [projectItemId]);

  const projectItemEventBus = useCreation(() => defaultProjectItemEventBus.createEditor(), []);
  const uploadResource = useUploadResource();

  const { projectId, itemId } = useProjectContext();
  const { navigator } = usePage();
  const databaseName = useSettingStore.getState().setting.database.active;
  const hoverClass = "hover:bg-hover";
  const activeClass = "bg-accent-soft text-accent-text";
  const borderClass = "border-line-1";

  const [titleEditable, setTitleEditable] = useState(false);
  const titleRef = useRef<EditTextHandle>(null);
  const titleAnchorRef = useRef<HTMLDivElement>(null);
  const [titleTruncated, setTitleTruncated] = useState(false);
  const [projectItem, setProjectItem] = useState<ProjectItem>();
  // 展开状态受控于域 store（值语义 = 是否展开，与持久层历史格式一致；树视图与
  // 思维导图共用）。定位脉冲由 ProjectList 的 batchReveal 统一写入，本组件只表达用户意图。
  // 订阅必须落在 open 值上（方法引用恒定，订阅它 store 更新不会触发重渲染，
  // 展开态将依赖无关渲染的时序而闪烁）
  const storedOpen = useProjectTreeExpandedStore(
    state => state.open[openEntryKey(databaseName, projectItemId)]
  );
  const setOpen = useProjectTreeExpandedStore(state => state.setOpen);
  const folderOpen =
    storedOpen ?? readPersistedOpen(databaseName, projectItemId) ?? path.length === 1;

  const { modalStates, openModal, closeModal } = useProjectItemModalStates();
  const { createWebLinkRecord, handleSelectWebviewFile } = useWebLinkHandlers({
    uploadResource,
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

  const createPdf = useCreatePdfRecord();
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

  const { handleYoutubeConfirm, handleBilibiliConfirm, handleRemoteVideoConfirm } =
    useVideoHandlers({
      closeModal,
      strategy: videoStrategy,
    });

  const { handleRemotePdfConfirm, handleSelectPdfConfirm } = usePdfHandlers({
    closeModal,
    strategy: pdfStrategy,
  });

  const {
    title: projectItemTitle,
    url: displayWebviewUrl,
    linkId: webLinkId,
  } = useProjectWebLinkMeta(projectItem);

  useEffect(() => {
    const titleElement = titleAnchorRef.current?.firstElementChild;
    if (!(titleElement instanceof HTMLElement)) return;

    const measure = () => {
      setTitleTruncated(titleElement.scrollWidth > titleElement.clientWidth);
    };
    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(titleElement);
    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(titleElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [projectItem?.id, titleEditable]);

  // 激活项是文件夹时展开自身并沿父链联动（itemId 为导航事件源，effect 合法）
  useEffect(() => {
    if (itemId === projectItemId) {
      setOpen(databaseName, projectItemId, true);
      onOpenChange?.(true);
    }
  }, [itemId]);

  const onChildOpenChange = useMemoizedFn((open: boolean) => {
    if (open) {
      setOpen(databaseName, projectItemId, true);
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
    onConfirm: onSelectPdfConfirm,
    onCancel: onSelectPdfCancel,
    excludePdfIds,
  } = useAddRefPdf({
    modalStates,
    openModal,
    closeModal,
    onConfirm: handleSelectPdfConfirm,
    projectItem,
  });

  const handleWebviewConfirm = useMemoizedFn(async (result: WebViewSelectResult) => {
    if (!projectItem || !projectId) {
      toast.error("项目文档尚未加载完成");
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
      toast.success("网页添加成功");
    } catch (error) {
      console.error("添加网页失败:", error);
      toast.error("添加网页失败");
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
      useDraggingStore.setState({
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
        toast.warning("移动失败，目标位置可能已变化");
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
      useDraggingStore.setState({
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

  const handleAddMenuClick = useMemoizedFn(async (key: string) => {
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
          version: WHITEBOARD_DOCUMENT_VERSION,
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
        toast.error("创建视频失败");
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
        const fileInfo = await importLocalPdf();
        if (!fileInfo) return;
        const pdf = await createPdf({
          fileName: fileInfo.fileName,
          filePath: fileInfo.filePath,
          isLocal: true,
          remoteUrl: "",
          tags: [],
          category: "",
        });
        await pdfStrategy.addProjectItem(createProjectItemFromPdf(pdf));
        toast.success("本地 PDF 添加成功");
      } catch (error) {
        console.error("添加本地 PDF 失败:", error);
        toast.error("添加本地 PDF 失败");
      }
    } else if (key === "add-remote-pdf-project-item") {
      openModal(ModalKey.RemotePdf);
    } else if (key === "link-pdf-project-item") {
      openSelectPdfModal();
    } else if (key === "link-card-project-item") {
      openSelectCardModal();
    } else if (key === "link-white-board-project-item") {
      openSelectWhiteBoardModal();
    } else if (key === "import-markdown") {
      if (!projectItem) return;
      await importMarkdownFiles(async ({ title, content }) => {
        const [parentProjectItem] = await addChildProjectItem(projectItemId, {
          title,
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
      });
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

  const depth = path.length - 1;
  const hasChildren = projectItem.children.length > 0;
  const isActive = itemId === projectItem.id;
  const leafIconClass = classnames("size-4", isActive ? "text-accent-text" : "text-ink-3");
  const titleToneClass = isActive
    ? "text-accent-text font-semibold"
    : hasChildren
      ? depth === 0
        ? "text-ink-1 font-semibold"
        : "text-ink-1 font-medium"
      : "text-ink-2";
  const actionButtonClass =
    "hover:bg-press flex size-[22px] cursor-pointer items-center justify-center rounded-[6px] transition-colors duration-200";

  const renderItemIcon = () => {
    if (hasChildren) {
      const FolderIcon = folderOpen ? FolderOpen : Folder;
      return (
        <FolderIcon
          className={classnames("size-4", getFolderToneClass(depth))}
          strokeWidth={1.75}
        />
      );
    }
    switch (projectItem.projectItemType) {
      case EProjectItemType.WhiteBoard:
        return <SVG src={whiteBoardIcon} className={leafIconClass} />;
      case EProjectItemType.VideoNote:
        return <Video className={leafIconClass} strokeWidth={1.75} />;
      case EProjectItemType.WebView:
        return <Globe className={leafIconClass} strokeWidth={1.75} />;
      case EProjectItemType.TableView:
        return <Table className={leafIconClass} strokeWidth={1.75} />;
      case EProjectItemType.Pdf:
        return <BookMarked className={leafIconClass} strokeWidth={1.75} />;
      default:
        return <FileText className={leafIconClass} strokeWidth={1.75} />;
    }
  };

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
            "group/row relative flex min-w-0 cursor-pointer items-center justify-between rounded-[6px] border border-transparent pl-[4px] pr-[2px] transition-all duration-200",
            {
              [activeClass]: isActive,
              [hoverClass]: !isActive,
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
            navigator.push("project-detail", { id: projectId, itemId: projectItem.id });
          }}
        >
          <div className="flex min-h-[30px] min-w-0 flex-1 items-center gap-[6px] overflow-hidden">
            {hasChildren ? (
              <Tooltip content={folderOpen ? "收起" : "展开"} delay={1000}>
                <button
                  type="button"
                  aria-label={folderOpen ? "收起" : "展开"}
                  className="text-ink-3 hover:text-ink-1 hover:bg-press flex size-4 flex-none items-center justify-center rounded-[4px] transition-colors duration-200"
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(databaseName, projectItemId, !folderOpen);
                  }}
                >
                  <ChevronRight
                    className={classnames("size-[13px] transition-transform duration-150", {
                      "rotate-90": folderOpen,
                    })}
                    strokeWidth={2}
                  />
                </button>
              </Tooltip>
            ) : (
              <span className="size-4 flex-none" aria-hidden />
            )}
            <span className="flex size-4 flex-none items-center justify-center">
              {renderItemIcon()}
            </span>
            <div className="min-w-0 flex-1 overflow-hidden">
              <Tooltip
                content={
                  projectItem.projectItemType === EProjectItemType.WebView
                    ? projectItemTitle
                    : projectItem.title
                }
                disabled={titleEditable || !titleTruncated}
                delay={1000}
              >
                <div
                  ref={titleAnchorRef}
                  className={classnames("min-w-0 max-w-full", titleEditable ? "w-full" : "w-fit")}
                >
                  <EditText
                    className={classnames(
                      "w-full min-w-0 max-w-full truncate leading-[30px]",
                      titleToneClass,
                      {
                        [`rounded border ${borderClass} whitespace-normal px-2`]: titleEditable,
                      }
                    )}
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
            className={[
              "text-ink-2 pointer-events-none flex flex-none items-center opacity-0 transition-opacity",
              "group-hover/row:pointer-events-auto group-hover/row:opacity-100",
              // 菜单展开期间鼠标已离开行，靠触发器的 aria-expanded 保持可见，避免锚点消失
              "has-[[aria-expanded=true]]:pointer-events-auto has-[[aria-expanded=true]]:opacity-100",
            ].join(" ")}
          >
            <Menu
              align="end"
              trigger={
                <div className={actionButtonClass}>
                  <MoreHorizontal className="size-[14px]" strokeWidth={1.75} />
                </div>
              }
            >
              {renderMenuEntries(moreMenuItems, key => void handleMoreMenuClick(key))}
            </Menu>
            <Menu
              align="end"
              trigger={
                <div className={actionButtonClass}>
                  <Plus className="size-[14px]" strokeWidth={1.75} />
                </div>
              }
            >
              {renderMenuEntries(ADD_MENU_ITEMS, key => void handleAddMenuClick(key))}
            </Menu>
          </div>
        </div>
        <div
          className={classnames(
            "grid overflow-hidden transition-[grid-template-rows] duration-300",
            {
              "grid-rows-[1fr]": folderOpen && hasChildren,
              "my-0 grid-rows-[0fr]": !folderOpen || !hasChildren,
            }
          )}
        >
          <div
            className={classnames(
              "relative flex min-h-0 w-full min-w-0 flex-col gap-[2px] pl-[18px]",
              GUIDE_LINE_CLASS,
              getGuideToneClass(depth, activeAncestorIds?.has(projectItem.id) ?? false)
            )}
          >
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
                  activeAncestorIds={activeAncestorIds}
                  onOpenChange={onChildOpenChange}
                  refreshProject={refreshProject}
                />
              )}
            />
          </div>
        </div>
        <ProjectReviewSlot itemId={projectItem.id} />
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
      <SelectPdfDialog
        open={selectPdfModalOpen}
        onConfirm={onSelectPdfConfirm}
        onCancel={onSelectPdfCancel}
        excludeIds={excludePdfIds}
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

      {moreActionModals}
    </>
  );
});

export default ProjectItem;
