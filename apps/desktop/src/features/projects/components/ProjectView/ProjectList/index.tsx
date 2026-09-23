import { useEffect, useState, useMemo, useRef } from "react";
import { Dropdown, Empty, MenuProps, Tooltip } from "antd";
import { Network, House, ListTree, Plus } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import useThemeColors from "@/hooks/useThemeColors";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { DEFAULT_COLUMNS, DEFAULT_ROWS } from "@/constants";
import ProjectItem from "./ProjectItem";
import If from "@/components/If";
import For from "@/components/For";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { SelectDropDown } from "@tau/shared";
import SidebarToggleButton from "@/components/SidebarToggleButton";

import styles from "./index.module.less";
import {
  CreateProjectItem,
  EProjectItemType,
  ICard,
  Project as IProject,
  WhiteBoard,
  IndexType,
  SearchResult,
} from "@/types";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import useUploadResource from "@/hooks/useUploadResource";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import SelectWhiteBoardModal from "@/components/SelectWhiteBoardModal";
import useAddRefCard from "./ProjectItem/useAddRefCard.ts";
import useAddRefWhiteBoard from "./useAddRefWhiteBoard.ts";
import useAddRefPdf from "./ProjectItem/useAddRefPdf";
import useAddRefEpub from "./ProjectItem/useAddRefEpub";
import { useProjectItemModalStates } from "../shared/hooks/useProjectItemModalStates";
import { useWebLinkHandlers } from "../shared/hooks/useWebLinkHandlers";
import { useVideoHandlers } from "../shared/hooks/useVideoHandlers";
import { useAudioHandlers } from "../shared/hooks/useAudioHandlers";
import { usePdfHandlers, createProjectItemFromPdf } from "../shared/hooks/usePdfHandlers";
import { useEpubHandlers, createProjectItemFromEpub } from "../shared/hooks/useEpubHandlers";
import { ADD_MENU_ITEMS } from "../shared/constants/menuItems";
import { ModalKey } from "../shared/constants/modalKeys";
import {
  getFileBaseName,
  readTextFile,
  selectFile,
  getProjectById,
  getAllWhiteBoards,
  getAllCards,
  getWhiteBoardById,
  createEmptyVideoNote,
  createEmptyAudioNote,
  createWhiteBoardContent,
  addRootProjectItem,
  addChildProjectItem,
  createDataTable,
  getProjectList,
  getProjectItemById,
} from "@/commands";
import { getContentLength, importFromMarkdown } from "@/utils";
import { importLocalBook } from "../shared/utils/bookImport";
import useSettingStore from "@/stores/useSettingStore";
import YoutubeVideoSelectModal from "@/components/YoutubeVideoSelectModal";
import BilibiliVideoSelectModal from "@/components/BilibiliVideoSelectModal";
import RemoteVideoSelectModal from "@/components/RemoteVideoSelectModal";
import RemotePdfSelectModal from "@/components/RemotePdfSelectModal";
import RemoteEpubSelectModal from "@/components/RemoteEpubSelectModal";
import RemoteAudioSelectModal from "@/components/RemoteAudioSelectModal";
import XiaoyuzhouInput from "../AudioNoteView/components/XiaoyuzhouInput";
import WebViewSelectModal, { type WebViewSelectResult } from "@/components/WebViewSelectModal";
import SelectPdfModal from "@/components/SelectPdfModal";
import SelectEpubModal from "@/components/SelectEpubModal";
import classnames from "classnames";
import usePdfsStore from "@/stores/usePdfsStore";
import useEpubsStore from "@/stores/useEpubsStore";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import ProjectMindMapView from "./ProjectMindMapView";
import { useProjectTreeData } from "./useProjectTreeData";
import { useProjectContext } from "../ProjectContext";
import { usePage } from "@/page/PageProvider";
import { toast } from "@tau/ui";

const Project = () => {
  const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
  const uploadResource = useUploadResource();
  const { projectId: id, itemId } = useProjectContext();
  const { navigator } = usePage();
  const { setting } = useSettingStore(state => ({ setting: state.setting }));
  const databaseName = setting.database.active;
  const [hideSidebar, setHideSidebar] = useState(false);
  const { divideClass } = useThemeColors();
  const [sidebarWidth, setSidebarWidth] = useLocalStorageState("project-list-sidebar-width", {
    defaultValue: 300,
  });
  const { containerWidth } = useProjectContext();
  const sidebarMaxWidth = containerWidth !== undefined ? Math.max(200, containerWidth - 300) : 900;
  const [project, setProject] = useState<IProject | null>(null);
  const [allProjects, setAllProjects] = useState<IProject[]>([]);
  const [cards, setCards] = useState<ICard[]>([]);
  const [whiteBoards, setWhiteBoards] = useState<WhiteBoard[]>([]);
  const { pdfs, initPdfs, createPdf } = usePdfsStore(
    useShallow(state => ({
      pdfs: state.pdfs,
      initPdfs: state.initPdfs,
      createPdf: state.createPdf,
    }))
  );
  const { epubs, initEpubs, createEpub } = useEpubsStore(
    useShallow(state => ({
      epubs: state.epubs,
      initEpubs: state.initEpubs,
      createEpub: state.createEpub,
    }))
  );
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [addingParentProjectItemId, setAddingParentProjectItemId] = useState<number | undefined>(
    undefined
  );
  const [sidebarView, setSidebarView] = useLocalStorageState<"tree" | "mindmap">(
    `project-sidebar-view:${databaseName}:${id}`,
    {
      defaultValue: "tree",
    }
  );
  const [mindMapState, setMindMapState] = useLocalStorageState<{
    pan?: { x: number; y: number };
    zoom?: number;
  }>(`project-mindmap-state:${databaseName}:${id}`, {
    defaultValue: {},
  });
  const mindMapViewportSaveTimerRef = useRef<number | null>(null);
  const pendingMindMapViewportRef = useRef<{
    pan: { x: number; y: number };
    zoom: number;
  } | null>(null);

  const { modalStates, openModal, closeModal } = useProjectItemModalStates();
  const { createWebLinkRecord, handleSelectWebviewFile } = useWebLinkHandlers({
    uploadResource,
  });

  const onFoldSidebar = useMemoizedFn(() => {
    setHideSidebar(!hideSidebar);
  });

  const handleSwitchProject = useMemoizedFn((proj: IProject) => {
    navigator.push("project-detail", { id: proj.id });
  });

  const handleToggleProjectDropdown = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowProjectDropdown(!showProjectDropdown);
  });

  useEffect(() => {
    getProjectList().then(projects => {
      setAllProjects(projects);
    });
    getAllCards().then(cards => {
      setCards(cards);
    });
    getAllWhiteBoards().then(whiteBoards => {
      setWhiteBoards(whiteBoards);
    });
  }, []);

  useDatabaseChangeEffect(() => {
    return (async () => {
      await initPdfs();
      await initEpubs();
    })();
  }, [initPdfs, initEpubs]);

  const refresh = useMemoizedFn(() => {
    getProjectById(Number(id))
      .then(res => {
        setProject(res);
      })
      .catch(e => {
        console.error(e);
      });
  });

  useEffect(() => {
    refresh();
  }, [refresh]);

  const { treeData, loading: treeLoading, reload: reloadProjectTree } = useProjectTreeData(project);

  const saveMindMapViewport = useMemoizedFn(
    (viewport: { pan: { x: number; y: number }; zoom: number }) => {
      setMindMapState(previous => {
        if (
          previous?.pan?.x === viewport.pan.x &&
          previous?.pan?.y === viewport.pan.y &&
          previous?.zoom === viewport.zoom
        ) {
          return previous;
        }
        return viewport;
      });
    }
  );

  const handleMindMapViewportChange = useMemoizedFn(
    (viewport: { pan: { x: number; y: number }; zoom: number }) => {
      pendingMindMapViewportRef.current = viewport;
      if (mindMapViewportSaveTimerRef.current !== null) return;

      mindMapViewportSaveTimerRef.current = window.setTimeout(() => {
        mindMapViewportSaveTimerRef.current = null;
        const nextViewport = pendingMindMapViewportRef.current;
        if (nextViewport) {
          saveMindMapViewport(nextViewport);
        }
      }, 200);
    }
  );

  useEffect(() => {
    return () => {
      if (mindMapViewportSaveTimerRef.current !== null) {
        window.clearTimeout(mindMapViewportSaveTimerRef.current);
      }
    };
  }, []);

  const addProjectItemToTarget = useMemoizedFn(
    async (createProjectItem: CreateProjectItem, parentProjectItemId?: number) => {
      if (!project) {
        throw new Error("项目尚未加载完成");
      }
      if (!parentProjectItemId) {
        const result = await addRootProjectItem(project.id, createProjectItem);
        setProject(result[0]);
        return result;
      }
      const [, createdItem] = await addChildProjectItem(parentProjectItemId, createProjectItem);
      const newProject = await getProjectById(project.id);
      setProject(newProject);
      const parentProjectItem = await getProjectItemById(parentProjectItemId);
      if (parentProjectItem) {
        // 让树视图中的父节点立刻刷新 children。
        reloadProjectTree();
      }
      return [newProject, createdItem] as [IProject, typeof createdItem];
    }
  );

  const targetAwareAddStrategy = useMemo(
    () => ({
      addProjectItem: async (createItem: CreateProjectItem) => {
        if (!project) {
          toast.error("项目尚未加载完成");
          return;
        }
        const [newProject, projectItem] = await addProjectItemToTarget(
          createItem,
          addingParentProjectItemId
        );
        if (projectItem) {
          navigator.push("project-detail", { id: newProject.id, itemId: projectItem.id });
        }
        setAddingParentProjectItemId(undefined);
      },
    }),
    [addProjectItemToTarget, addingParentProjectItemId, navigator, project]
  );

  const { handleYoutubeConfirm, handleBilibiliConfirm, handleRemoteVideoConfirm } =
    useVideoHandlers({
      closeModal,
      strategy: targetAwareAddStrategy,
    });

  const { handleRemotePdfConfirm, handleSelectPdfConfirm } = usePdfHandlers({
    closeModal,
    strategy: targetAwareAddStrategy,
  });

  const { handleRemoteEpubConfirm, handleSelectEpubConfirm } = useEpubHandlers({
    closeModal,
    strategy: targetAwareAddStrategy,
  });

  const {
    handleRemoteAudioConfirm,
    handleXiaoyuzhouConfirm,
    handleBilibiliAudioConfirm,
    handleYoutubeAudioConfirm,
  } = useAudioHandlers({
    closeModal,
    strategy: targetAwareAddStrategy,
  });

  const handleWebviewConfirm = useMemoizedFn(async (result: WebViewSelectResult) => {
    if (!project) {
      toast.error("项目尚未加载完成");
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

      const [newProject, item] = await addProjectItemToTarget(
        createProjectItem,
        addingParentProjectItemId
      );
      if (item) {
        navigator.push("project-detail", { id: newProject.id, itemId: item.id });
      }
      setAddingParentProjectItemId(undefined);
      closeModal(ModalKey.Webview);
      toast.success("网页添加成功");
    } catch (error) {
      console.error("添加网页失败:", error);
      toast.error("添加网页失败");
    }
  });

  const {
    onOk: onCardOk,
    onCancel: onCardCancel,
    selectCardModalOpen,
    openSelectCardModal,
    excludeCardIds,
  } = useAddRefCard(cards, Number(id));

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

    if (addingParentProjectItemId && newSelectedCards[0]) {
      if (!project) return;
      const selectCard = newSelectedCards[0];
      const [, item] = await addProjectItemToTarget(
        {
          title: "新文档",
          content: selectCard.content,
          children: [],
          refType: "card",
          refId: selectCard.id,
          projectItemType: EProjectItemType.Document,
          count: 0,
          whiteBoardContentId: 0,
        },
        addingParentProjectItemId
      );
      if (item) {
        navigator.push("project-detail", { id: project.id, itemId: item.id });
      }
      setAddingParentProjectItemId(undefined);
      onCardCancel();
      return;
    }

    const res = await onCardOk(newSelectedCards);
    if (res && res[0]) {
      setProject(res[0] as IProject);
    }
  };

  const {
    selectedWhiteBoards,
    onChange: onWhiteBoardChange,
    onOk: onWhiteBoardOk,
    onCancel: onWhiteBoardCancel,
    selectWhiteBoardModalOpen,
    openSelectWhiteBoardModal,
    excludeWhiteBoardIds,
    multiple,
  } = useAddRefWhiteBoard(whiteBoards, Number(id));

  const handleOnSelectWhiteboardOk = useMemoizedFn(async (whiteBoards: WhiteBoard[]) => {
    if (addingParentProjectItemId && whiteBoards[0]) {
      if (!project) return;
      const fullWhiteBoard = await getWhiteBoardById(whiteBoards[0].id);
      if (!fullWhiteBoard || fullWhiteBoard.whiteBoardContentIds.length === 0) {
        toast.error(`获取白板 ${whiteBoards[0].title} 数据失败`);
        return;
      }
      const [, item] = await addProjectItemToTarget(
        {
          title: fullWhiteBoard.title,
          content: [],
          whiteBoardContentId: fullWhiteBoard.whiteBoardContentIds[0],
          children: [],
          refType: "white-board",
          refId: fullWhiteBoard.id,
          projectItemType: EProjectItemType.WhiteBoard,
          count: 0,
        },
        addingParentProjectItemId
      );
      if (item) {
        navigator.push("project-detail", { id: project.id, itemId: item.id });
      }
      setAddingParentProjectItemId(undefined);
      onWhiteBoardCancel();
      return;
    }

    const res = await onWhiteBoardOk(whiteBoards);
    if (res && res[0]) {
      setProject(res[0] as IProject);
    }
  });

  const {
    selectPdfModalOpen,
    openSelectPdfModal,
    onOk: onSelectPdfOk,
    onCancel: onSelectPdfCancel,
    selectedPdfId,
    onSelect: onPdfSelect,
    excludePdfIds,
  } = useAddRefPdf(pdfs, {
    modalStates,
    openModal,
    closeModal,
    onConfirm: handleSelectPdfConfirm,
  });

  const {
    selectEpubModalOpen,
    openSelectEpubModal,
    onOk: onSelectEpubOk,
    onCancel: onSelectEpubCancel,
    selectedEpubId,
    onSelect: onEpubSelect,
    excludeEpubIds,
  } = useAddRefEpub(epubs, {
    modalStates,
    openModal,
    closeModal,
    onConfirm: handleSelectEpubConfirm,
  });

  const handleAddMenuClick = useMemoizedFn(
    async (
      { key }: Parameters<NonNullable<MenuProps["onClick"]>>[0],
      parentProjectItemId?: number
    ) => {
      if (!project) return;
      if (key === "add-project-item") {
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
        const [newProject, item] = await addProjectItemToTarget(
          createProjectItem,
          parentProjectItemId
        );
        if (item) {
          navigator.push("project-detail", { id: newProject.id, itemId: item.id });
        }
      } else if (key === "add-white-board-project-item") {
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
        const [newProject, item] = await addProjectItemToTarget(
          createProjectItem,
          parentProjectItemId
        );
        if (item) {
          navigator.push("project-detail", { id: newProject.id, itemId: item.id });
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
          toast.error("创建视频笔记失败");
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
        const [newProject, projectItem] = await addProjectItemToTarget(
          createProjectItem,
          parentProjectItemId
        );
        if (projectItem) {
          navigator.push("project-detail", { id: newProject.id, itemId: projectItem.id });
        }
      } else if (key === "add-remote-video-note-project-item") {
        setAddingParentProjectItemId(parentProjectItemId);
        openModal(ModalKey.WebVideo);
      } else if (key === "add-bilibili-video-note-project-item") {
        setAddingParentProjectItemId(parentProjectItemId);
        openModal(ModalKey.Bilibili);
      } else if (key === "add-youtube-video-note-project-item") {
        setAddingParentProjectItemId(parentProjectItemId);
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
          toast.error("创建音频笔记失败");
          return;
        }
        const fileName = await getFileBaseName(filePath[0], true);
        const createProjectItem: CreateProjectItem = {
          title: fileName,
          content: [],
          children: [],
          refType: "audio-note",
          refId: audioNote.id,
          projectItemType: EProjectItemType.AudioNote,
          count: 0,
          whiteBoardContentId: 0,
        };
        const [newProject2, projectItem2] = await addProjectItemToTarget(
          createProjectItem,
          parentProjectItemId
        );
        if (projectItem2) {
          navigator.push("project-detail", { id: newProject2.id, itemId: projectItem2.id });
        }
      } else if (key === "add-remote-audio-note-project-item") {
        setAddingParentProjectItemId(parentProjectItemId);
        openModal(ModalKey.RemoteAudio);
      } else if (key === "add-xiaoyuzhou-audio-note-project-item") {
        setAddingParentProjectItemId(parentProjectItemId);
        openModal(ModalKey.XiaoyuzhouPodcast);
      } else if (key === "add-bilibili-audio-note-project-item") {
        setAddingParentProjectItemId(parentProjectItemId);
        openModal(ModalKey.BilibiliAudio);
      } else if (key === "add-youtube-audio-note-project-item") {
        setAddingParentProjectItemId(parentProjectItemId);
        openModal(ModalKey.YoutubeAudio);
      } else if (key === "add-webview-project-item") {
        setAddingParentProjectItemId(parentProjectItemId);
        openModal(ModalKey.Webview);
      } else if (key === "add-table-project-item") {
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
        const [newProject, item] = await addProjectItemToTarget(
          createProjectItem,
          parentProjectItemId
        );
        if (item) {
          navigator.push("project-detail", { id: newProject.id, itemId: item.id });
        }
      } else if (key === "add-local-pdf-project-item") {
        try {
          const fileInfo = await importLocalBook("pdf");
          if (!fileInfo) return;
          const pdf = await createPdf({
            fileName: fileInfo.fileName,
            filePath: fileInfo.filePath,
            isLocal: true,
            remoteUrl: "",
            tags: [],
            category: "",
          });
          const [, item] = await addProjectItemToTarget(
            createProjectItemFromPdf(pdf),
            parentProjectItemId
          );
          if (item) {
            navigator.push("project-detail", { id: project.id, itemId: item.id });
          }
          toast.success("本地 PDF 添加成功");
        } catch (error) {
          console.error("添加本地 PDF 失败:", error);
          toast.error("添加本地 PDF 失败");
        }
      } else if (key === "add-remote-pdf-project-item") {
        setAddingParentProjectItemId(parentProjectItemId);
        openModal(ModalKey.RemotePdf);
      } else if (key === "link-pdf-project-item") {
        setAddingParentProjectItemId(parentProjectItemId);
        openSelectPdfModal();
      } else if (key === "add-local-epub-project-item") {
        try {
          const fileInfo = await importLocalBook("epub");
          if (!fileInfo) return;
          const epub = await createEpub({
            fileName: fileInfo.fileName,
            filePath: fileInfo.filePath,
            isLocal: true,
            remoteUrl: "",
            tags: [],
            category: "default",
            progressPercentage: 0,
          });
          const [, item] = await addProjectItemToTarget(
            createProjectItemFromEpub(epub),
            parentProjectItemId
          );
          if (item) {
            navigator.push("project-detail", { id: project.id, itemId: item.id });
          }
          toast.success("本地 EPUB 添加成功");
        } catch (error) {
          console.error("添加本地 EPUB 失败:", error);
          toast.error("添加本地 EPUB 失败");
        }
      } else if (key === "add-remote-epub-project-item") {
        setAddingParentProjectItemId(parentProjectItemId);
        openModal(ModalKey.RemoteEpub);
      } else if (key === "link-epub-project-item") {
        setAddingParentProjectItemId(parentProjectItemId);
        openSelectEpubModal();
      } else if (key === "link-card-project-item") {
        setAddingParentProjectItemId(parentProjectItemId);
        openSelectCardModal();
      } else if (key === "link-white-board-project-item") {
        setAddingParentProjectItemId(parentProjectItemId);
        openSelectWhiteBoardModal();
      } else if (key === "import-markdown") {
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
          const [newProject, item] = await addProjectItemToTarget(
            {
              title: fileName,
              content,
              children: [],
              refType: "",
              refId: 0,
              projectItemType: EProjectItemType.Document,
              count: getContentLength(content),
              whiteBoardContentId: 0,
            },
            parentProjectItemId
          );
          if (item) {
            navigator.push("project-detail", { id: newProject.id, itemId: item.id });
          }
        }
      }
    }
  );

  if (!project) return null;

  return (
    <>
      <ResizeableAndHideableSidebar
        width={sidebarWidth ?? 300}
        onWidthChange={setSidebarWidth}
        open={!hideSidebar}
        onToggle={onFoldSidebar}
        sidebarPosition="left"
        maxWidth={sidebarMaxWidth}
        disableResize={false}
        className="h-full"
      >
        <div className={styles.list}>
          <div className={styles.header}>
            <div className={styles.title}>
              <House
                onClick={() => {
                  navigator.push("projects");
                }}
              />
              <div className="flex-1 overflow-hidden">
                <div
                  ref={triggerRef}
                  className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-all hover:bg-gray-100 dark:hover:bg-zinc-800"
                  onClick={handleToggleProjectDropdown}
                >
                  <span className="truncate">{project.title}</span>
                  <ChevronDown
                    size={16}
                    className={`text-gray-900 transition-transform duration-200 dark:text-gray-100 ${
                      showProjectDropdown ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </div>
            </div>
            <div className={styles.icons}>
              <Tooltip title={sidebarView === "tree" ? "切换到思维导图" : "切换到树视图"}>
                <div
                  className={classnames(styles.icon, "mr-1 transition-colors")}
                  onClick={() => setSidebarView(sidebarView === "tree" ? "mindmap" : "tree")}
                >
                  {sidebarView === "tree" ? <ListTree /> : <Network />}
                </div>
              </Tooltip>
              <Dropdown
                menu={{
                  items: ADD_MENU_ITEMS,
                  onClick: handleAddMenuClick,
                }}
              >
                <div className={styles.icon}>
                  <Plus />
                </div>
              </Dropdown>
            </div>
          </div>
          <div className={classnames(styles.divider, divideClass)}></div>
          <div className={styles.contentArea}>
            {sidebarView === "mindmap" ? (
              treeLoading ? (
                <div className="flex h-full items-center justify-center text-sm opacity-60">
                  正在加载思维导图...
                </div>
              ) : (
                <ProjectMindMapView
                  project={project}
                  treeData={treeData}
                  activeItemId={itemId}
                  databaseName={databaseName}
                  cards={cards}
                  whiteBoards={whiteBoards}
                  pdfs={pdfs}
                  epubs={epubs}
                  addMenuItems={ADD_MENU_ITEMS}
                  onAddMenuClick={handleAddMenuClick}
                  refreshProject={refresh}
                  reloadTree={reloadProjectTree}
                  initialPan={mindMapState?.pan}
                  initialZoom={mindMapState?.zoom}
                  onViewportChange={handleMindMapViewportChange}
                />
              )
            ) : (
              <>
                <If condition={project.children.length === 0}>
                  <Empty description={"项目下暂无文档"} />
                </If>
                <For
                  data={project.children}
                  renderItem={(projectItemId, index) => (
                    <ProjectItem
                      projectItemId={projectItemId}
                      isRoot
                      key={projectItemId}
                      path={[index]}
                      parentProjectItemId={project.id}
                      parentChildren={project.children}
                      cards={cards}
                      whiteBoards={whiteBoards}
                      pdfs={pdfs}
                      epubs={epubs}
                      refreshProject={refresh}
                    />
                  )}
                />
              </>
            )}
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
            extensions={dynamicExtensions}
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
          <YoutubeVideoSelectModal
            open={modalStates.youtube}
            onCancel={() => closeModal(ModalKey.Youtube)}
            onConfirm={handleYoutubeConfirm}
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
        </div>
      </ResizeableAndHideableSidebar>
      <SidebarToggleButton.Expand isHidden={hideSidebar} onToggle={onFoldSidebar} side="left" />
      <SelectDropDown
        items={allProjects}
        selectedKey={project.id}
        show={showProjectDropdown}
        onClose={() => setShowProjectDropdown(false)}
        onSelect={handleSwitchProject}
        triggerElement={triggerRef.current}
        getKey={proj => proj.id}
        renderItem={proj => proj.title}
        width={240}
      />
    </>
  );
};

export default Project;
