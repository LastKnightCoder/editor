import { useState, useEffect, memo, useRef, useMemo } from "react";
import classnames from "classnames";
import { useCreation, useLocalStorageState, useMemoizedFn } from "ahooks";
import useUploadResource from "@/hooks/useUploadResource";
import { App, Dropdown, MenuProps, message, Tooltip } from "antd";
import { produce } from "immer";
import {
  getFileBaseName,
  readTextFile,
  selectFile,
  getProjectById,
  getProjectItemById,
  updateProjectItem,
  openProjectItemInNewWindow,
  createEmptyVideoNote,
  createWhiteBoardContent,
  addChildProjectItem,
  removeRootProjectItem,
  removeChildProjectItem,
  createDataTable,
  createWebLink,
  updateWebLink,
} from "@/commands";
import { DEFAULT_COLUMNS, DEFAULT_ROWS } from "@/constants";
import useProjectWebLinkMeta from "@/hooks/useProjectWebLinkMeta";
import SelectWhiteBoardModal from "@/components/SelectWhiteBoardModal";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import NotionSyncModal, {
  NotionSyncConfig,
} from "@/components/NotionSyncModal";
import useProjectsStore from "@/stores/useProjectsStore";
import useWhiteBoardStore from "@/stores/useWhiteBoardStore";
import useSettingStore from "@/stores/useSettingStore";
import useShortcutStore from "@/stores/useShortcutStore";
import useTabStore from "@/stores/useTabStore";
import useDragAndDrop, {
  EDragPosition,
  IDragItem,
} from "@/hooks/useDragAndDrop";
import useAddRefCard from "./useAddRefCard";
import useAddRefWhiteBoard from "../useAddRefWhiteBoard";
import { useProjectItemModalStates } from "../../shared/hooks/useProjectItemModalStates";
import { ADD_MENU_ITEMS } from "../../shared/constants/menuItems";
import { ModalKey } from "../../shared/constants/modalKeys";
import { createNotionPage, appendNotionBlock } from "@/commands/notion";
import { createNotionSync, updateNotionSync } from "@/commands/notion-sync";
import { generateContentHash } from "@/utils/content-hash";
import { Descendant } from "slate";

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
  WhiteBoardContent,
  WebLinkSourceType,
} from "@/types";
import { TabType } from "@/types/tab";
import {
  FileOutlined,
  FolderOpenTwoTone,
  MoreOutlined,
  PlusOutlined,
  GlobalOutlined,
  VideoCameraOutlined,
  TableOutlined,
} from "@ant-design/icons";
import {
  getContentLength,
  importFromMarkdown,
  defaultProjectItemEventBus,
  getMarkdown,
  downloadMarkdown,
} from "@/utils";
import whiteBoardIcon from "@/assets/icons/white-board.svg";

import { isValid } from "@/components/WhiteBoard/utils";
import EditText, { EditTextHandle } from "@/components/EditText";
import PresentationMode from "@/components/PresentationMode";
import ContentExportModal from "@/components/ContentExportModal";
import { useProjectContext } from "../../ProjectContext";
import { useThemeColors } from "@/hooks";
import YoutubeVideoSelectModal, {
  type YoutubeVideoSelectResult,
} from "@/components/YoutubeVideoSelectModal";
import BilibiliVideoSelectModal, {
  type BilibiliVideoSelectResult,
} from "@/components/BilibiliVideoSelectModal";
import NotionVideoSelectModal, {
  type NotionVideoSelectResult,
} from "@/components/NotionVideoSelectModal";
import RemoteVideoSelectModal, {
  type RemoteVideoSelectResult,
} from "@/components/RemoteVideoSelectModal";
import WebViewSelectModal, {
  type WebViewSelectResult,
} from "@/components/WebViewSelectModal";
import EditTitleModal from "@/components/EditTitleModal";

import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
  createProjectCardListExtension,
} from "@/editor-extensions";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
  chatReferenceExtension,
];

const TOP_DROP_INDICATOR_CLASS = [
  "before:content-['']",
  "before:absolute",
  "before:left-[2px]",
  "before:[top:-2px]",
  "before:h-[2px]",
  "before:w-[calc(100%-4px)]",
  "before:bg-[var(--active-text-color)]",
  "after:content-['']",
  "after:absolute",
  "after:[top:-5px]",
  "after:left-0",
  "after:border-[4px]",
  "after:border-transparent",
  "after:[border-left-color:var(--active-text-color)]",
].join(" ");

const BOTTOM_DROP_INDICATOR_CLASS = [
  "before:content-['']",
  "before:absolute",
  "before:left-[2px]",
  "before:[bottom:-2px]",
  "before:h-[2px]",
  "before:w-[calc(100%-4px)]",
  "before:bg-[var(--active-text-color)]",
  "after:content-['']",
  "after:absolute",
  "after:[bottom:-5px]",
  "after:left-0",
  "after:border-[4px]",
  "after:border-transparent",
  "after:[border-left-color:var(--active-text-color)]",
].join(" ");

const INSIDE_DROP_INDICATOR_CLASS = [
  "border",
  "border-dashed",
  "border-[var(--active-text-color)]",
  "bg-[var(--active-bg-color)]",
].join(" ");

interface IProjectItemProps {
  projectItemId: number;
  parentProjectItemId: number;
  isRoot?: boolean;
  path: number[];
  parentChildren: number[];
  cards: ICard[];
  whiteBoards: WhiteBoard[];
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
    onOpenChange,
    refreshProject,
  } = props;

  const extensions = useCreation(() => {
    return [...customExtensions, createProjectCardListExtension(projectItemId)];
  }, [projectItemId]);

  const projectItemEventBus = useCreation(
    () => defaultProjectItemEventBus.createEditor(),
    [],
  );
  const uploadResource = useUploadResource();

  const { projectId, itemId } = useProjectContext();
  const databaseName = useSettingStore.getState().setting.database.active;
  const navigateTo = useTabStore((state) => state.navigateTo);
  const openInNewTab = useTabStore((state) => state.openInNewTab);
  const panes = useTabStore((state) => state.panes);
  const activePaneId = useTabStore((state) => state.activePaneId);
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
    },
  );

  const { modalStates, openModal, closeModal } = useProjectItemModalStates();
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [editTitleModalOpen, setEditTitleModalOpen] = useState(false);

  const {
    title: projectItemTitle,
    url: displayWebviewUrl,
    linkId: webLinkId,
  } = useProjectWebLinkMeta(projectItem);

  const createWebLinkRecord = useMemoizedFn(
    async (title: string, url: string, sourceType: WebLinkSourceType) => {
      const finalTitle = title.trim() || url;
      return await createWebLink({
        title: finalTitle,
        url,
        sourceType,
      });
    },
  );

  const { updateProject } = useProjectsStore((state) => ({
    updateProject: state.updateProject,
  }));

  const {
    findShortcut,
    createShortcut,
    deleteShortcut,
    loaded,
    loadShortcuts,
    items: shortcuts,
  } = useShortcutStore();

  const setting = useSettingStore.getState().setting;

  useEffect(() => {
    if (itemId === projectItemId) {
      setFolderOpen(true);
      onOpenChange?.(true);
    }
  }, [itemId]);

  // 加载快捷方式
  useEffect(() => {
    if (!loaded) {
      loadShortcuts();
    }
  }, [loaded, loadShortcuts]);

  // 检查是否已添加快捷方式
  const isShortcut = useMemo(() => {
    if (!projectItem) return null;
    return findShortcut({
      resourceType: "project",
      scope: "item",
      resourceId: projectId,
      projectItemId: projectItem.id,
    });
  }, [findShortcut, projectId, projectItem, shortcuts]);

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
    buildCardFromProjectItem,
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

  const handleOnSelectWhiteboardOk = useMemoizedFn(
    async (whiteBoards: WhiteBoard[]) => {
      const res = await onWhiteBoardOk(whiteBoards);
      if (res) {
        const [parentProjectItem] = res;
        if (parentProjectItem) {
          setProjectItem(parentProjectItem as ProjectItem);
          projectItemEventBus.publishProjectItemEvent(
            "project-item:updated",
            parentProjectItem as ProjectItem,
          );
        }
      }
    },
  );

  const { modal } = App.useApp();
  const [isPresentation, setIsPresentation] = useState(false);

  const handleRemoteConfirm = useMemoizedFn(
    async (result: RemoteVideoSelectResult) => {
      if (!projectItem || !projectId) {
        message.error("项目文档尚未加载完成");
        return;
      }
      try {
        const item = await createEmptyVideoNote({
          type: "remote",
          url: result.url,
        });
        if (!item) {
          message.error("创建视频笔记失败");
          return;
        }

        const createProjectItem: CreateProjectItem = {
          title: `在线视频 - ${result.url}`,
          content: [],
          children: [],
          refType: "video-note",
          refId: item.id,
          projectItemType: EProjectItemType.VideoNote,
          count: 0,
          whiteBoardContentId: 0,
        };

        const [parentProjectItem] = await addChildProjectItem(
          projectItem.id,
          createProjectItem,
        );
        if (parentProjectItem) {
          setProjectItem(parentProjectItem);
          projectItemEventBus.publishProjectItemEvent(
            "project-item:updated",
            parentProjectItem,
          );
        }
        closeModal(ModalKey.WebVideo);
        message.success("在线视频笔记添加成功");
      } catch (error) {
        console.error("添加在线视频失败:", error);
        message.error("添加在线视频失败");
      }
    },
  );

  const handleBilibiliConfirm = useMemoizedFn(
    async (result: BilibiliVideoSelectResult) => {
      if (!projectItem || !projectId) {
        message.error("项目文档尚未加载完成");
        return;
      }
      try {
        const item = await createEmptyVideoNote(result.metaInfo);
        if (!item) {
          message.error("创建视频笔记失败");
          return;
        }

        const createProjectItem: CreateProjectItem = {
          title: result.title || `Bilibili 视频 - ${result.metaInfo.bvid}`,
          content: [],
          children: [],
          refType: "video-note",
          refId: item.id,
          projectItemType: EProjectItemType.VideoNote,
          count: 0,
          whiteBoardContentId: 0,
        };

        const [parentProjectItem] = await addChildProjectItem(
          projectItem.id,
          createProjectItem,
        );
        if (parentProjectItem) {
          setProjectItem(parentProjectItem);
          projectItemEventBus.publishProjectItemEvent(
            "project-item:updated",
            parentProjectItem,
          );
        }
        closeModal(ModalKey.Bilibili);
        message.success("Bilibili 视频笔记添加成功");
      } catch (error) {
        console.error("添加 Bilibili 视频失败:", error);
        message.error("添加 Bilibili 视频失败");
      }
    },
  );

  const handleNotionConfirm = useMemoizedFn(
    async (result: NotionVideoSelectResult) => {
      if (!projectItem || !projectId) {
        message.error("项目文档尚未加载完成");
        return;
      }
      try {
        const item = await createEmptyVideoNote(result.metaInfo);
        if (!item) {
          message.error("创建视频笔记失败");
          return;
        }

        const createProjectItem: CreateProjectItem = {
          title: "Notion 视频笔记",
          content: [],
          children: [],
          refType: "video-note",
          refId: item.id,
          projectItemType: EProjectItemType.VideoNote,
          count: 0,
          whiteBoardContentId: 0,
        };

        const [parentProjectItem] = await addChildProjectItem(
          projectItem.id,
          createProjectItem,
        );
        if (parentProjectItem) {
          setProjectItem(parentProjectItem);
          projectItemEventBus.publishProjectItemEvent(
            "project-item:updated",
            parentProjectItem,
          );
        }
        closeModal(ModalKey.Notion);
        message.success("Notion 视频添加成功");
      } catch (error) {
        console.error("添加 Notion 视频失败:", error);
        message.error("添加 Notion 视频失败");
      }
    },
  );

  const handleWebviewConfirm = useMemoizedFn(
    async (result: WebViewSelectResult) => {
      if (!projectItem || !projectId) {
        message.error("项目文档尚未加载完成");
        return;
      }

      try {
        const webLink = await createWebLinkRecord(
          result.title,
          result.url,
          result.sourceType,
        );

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

        const [parentProjectItem] = await addChildProjectItem(
          projectItem.id,
          createProjectItem,
        );

        if (parentProjectItem) {
          setProjectItem(parentProjectItem);
          projectItemEventBus.publishProjectItemEvent(
            "project-item:updated",
            parentProjectItem,
          );
        }

        closeModal(ModalKey.Webview);
        message.success("网页添加成功");
      } catch (error) {
        console.error("添加网页失败:", error);
        message.error("添加网页失败");
      }
    },
  );

  const handleSelectWebviewFile = useMemoizedFn(async () => {
    const filePaths = await selectFile({
      properties: ["openFile"],
      filters: [
        {
          name: "HTML",
          extensions: ["html", "htm"],
        },
      ],
    });

    if (!filePaths || filePaths.length === 0) return null;

    const filePath = filePaths[0];
    try {
      message.loading({
        key: "project-item-webview-html",
        content: "正在上传 HTML 文件...",
        duration: 0,
      });
      const fileName = await getFileBaseName(filePath);
      const fileTitle = await getFileBaseName(filePath, true);
      const fileContent = await readTextFile(filePath);
      const htmlFile = new File([fileContent], fileName, {
        type: "text/html",
      });
      const uploadedUrl = await uploadResource(htmlFile);
      if (!uploadedUrl) {
        message.error({
          key: "project-item-webview-html",
          content: "上传 HTML 文件失败",
        });
        return null;
      }
      message.success({
        key: "project-item-webview-html",
        content: "HTML 文件已添加",
      });
      return {
        url: uploadedUrl,
        fileName,
        title: fileTitle || fileName,
      };
    } catch (error) {
      console.error("选择 HTML 文件失败:", error);
      message.error({
        key: "project-item-webview-html",
        content: "选择 HTML 文件失败",
      });
      return null;
    }
  });

  const handleYoutubeConfirm = useMemoizedFn(
    async (result: YoutubeVideoSelectResult) => {
      try {
        const item = await createEmptyVideoNote({
          type: "youtube",
          url: result.url,
          videoStream: result.videoStream,
          audioStream: result.audioStream,
        });

        if (!item) {
          message.error("创建视频笔记失败");
          return;
        }

        const createChildProjectItem: CreateProjectItem = {
          title: result.title || `YouTube 视频 - ${result.url}`,
          content: [],
          children: [],
          refType: "video-note",
          refId: item.id,
          projectItemType: EProjectItemType.VideoNote,
          count: 0,
          whiteBoardContentId: 0,
        };

        if (!projectItem) {
          message.error("项目文档尚未加载完成");
          return;
        }

        const [parentProjectItem] = await addChildProjectItem(
          projectItem.id,
          createChildProjectItem,
        );
        if (parentProjectItem) {
          setProjectItem(parentProjectItem);
          projectItemEventBus.publishProjectItemEvent(
            "project-item:updated",
            parentProjectItem,
          );
        }
        closeModal(ModalKey.Youtube);
        message.success("YouTube 视频笔记添加成功！");
      } catch (e) {
        console.error(e);
        message.error("添加 YouTube 视频失败");
      }
    },
  );

  const refresh = useMemoizedFn((projectItemId) => {
    getProjectItemById(projectItemId).then((projectItem) => {
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
      (data) => {
        setProjectItem(data.projectItem);
        titleRef.current?.setValue(data.projectItem.title);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [projectItemId, projectItemEventBus]);

  const { createWhiteBoard } = useWhiteBoardStore((state) => ({
    createWhiteBoard: state.createWhiteBoard,
  }));

  const onRemoveProjectItem = useMemoizedFn(async () => {
    modal.confirm({
      title: "删除项目文档",
      content: "确定删除该项目文档吗？",
      onOk: async () => {
        if (isRoot) {
          if (projectId) {
            await removeRootProjectItem(projectId, projectItemId);
            refreshProject?.();
          }
        } else {
          if (parentProjectItemId) {
            const [parentProjectItem] = await removeChildProjectItem(
              projectId,
              parentProjectItemId,
              projectItemId,
            );
            if (parentProjectItem) {
              setProjectItem(parentProjectItem);
              projectItemEventBus.publishProjectItemEvent(
                "project-item:updated",
                parentProjectItem,
              );
            }
          }
        }
        if (itemId === projectItemId) {
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

  const onDrop = useMemoizedFn(
    async (dragItem: IDragItem, dragPosition: EDragPosition) => {
      if (!projectItem || !projectId) return;
      const {
        itemId: dragId,
        parentId: dragParentId,
        isRoot: dragIsRoot,
      } = dragItem;

      const needRefreshId = [dragId];

      try {
        useProjectsStore.setState({
          dragging: true,
        });
        if (dragIsRoot) {
          if (projectId) {
            await removeRootProjectItem(projectId, dragId, true);
            refreshProject?.();
          }
        } else {
          if (dragParentId) {
            await removeChildProjectItem(projectId, dragParentId, dragId, true);
            needRefreshId.push(dragParentId);
          }
        }

        const dragProjectItem = await getProjectItemById(dragId);
        if (!dragProjectItem) return;

        if (dragPosition === EDragPosition.Inside) {
          const newDragProjectItem = produce(dragProjectItem, (draft) => {
            if (!draft.parents.includes(projectItemId)) {
              draft.parents.push(projectItemId);
            }
            for (const projectId of projectItem.projects) {
              if (!draft.projects.includes(projectId)) {
                draft.projects.push(projectId);
              }
            }
          });
          await updateProjectItem(newDragProjectItem);
          const newProjectItem = produce(projectItem, (draft) => {
            if (!draft.children.includes(dragId)) {
              draft.children.push(dragId);
            }
          });
          await updateProjectItem(newProjectItem);
          needRefreshId.push(projectItemId);
        } else {
          const project = await getProjectById(projectId);
          if (!project) return;
          if (isRoot) {
            // 如果是 root，则更新 project，向 project 中添加新的 projectItem
            const newProject = produce(project, (draft) => {
              draft.children = draft.children.filter(
                (childId) => childId !== dragId,
              );
              // 获取当前 projectItem 在 project 中的位置
              const index = draft.children.findIndex(
                (childId) => childId === projectItemId,
              );
              if (index === -1) return;
              const spliceIndex =
                dragPosition === EDragPosition.Top ? index : index + 1;
              draft.children.splice(spliceIndex, 0, dragId);
            });
            // 更新 project
            await updateProject(newProject);
            // 更新其 projects
            const newDragProjectItem = produce(dragProjectItem, (draft) => {
              if (!draft.projects.includes(projectId)) {
                draft.projects.push(projectId);
              }
            });
            await updateProjectItem(newDragProjectItem);
            refreshProject?.();
          } else {
            const parentProjectItem =
              await getProjectItemById(parentProjectItemId);
            if (!parentProjectItem) return;
            const newDragProjectItem = produce(dragProjectItem, (draft) => {
              if (!draft.parents.includes(parentProjectItemId)) {
                draft.parents.push(parentProjectItemId);
              }
              for (const projectId of parentProjectItem.projects) {
                if (!draft.projects.includes(projectId)) {
                  draft.projects.push(projectId);
                }
              }
            });
            await updateProjectItem(newDragProjectItem);
            const newParentProjectItem = produce(parentProjectItem, (draft) => {
              // 找到当前 projectItem 在父节点中的位置
              const index = draft.children.findIndex(
                (childId) => childId === projectItemId,
              );
              if (index === -1) return;
              const spliceIndex =
                dragPosition === EDragPosition.Top ? index : index + 1;
              draft.children.splice(spliceIndex, 0, dragId);
            });
            await updateProjectItem(newParentProjectItem);
            needRefreshId.push(parentProjectItemId);
          }
        }
      } finally {
        if (
          itemId &&
          [dragId, dragParentId, projectItemId, parentProjectItemId].includes(
            itemId,
          )
        ) {
          needRefreshId.push(itemId);
        }
        for (const refreshId of [...new Set(needRefreshId)]) {
          const updatedProjectItem = await getProjectItemById(refreshId);
          if (!updatedProjectItem) continue;
          defaultProjectItemEventBus
            .createEditor()
            .publishProjectItemEvent(
              "project-item:updated",
              updatedProjectItem,
            );
        }
        useProjectsStore.setState({
          dragging: false,
        });
      }
    },
  );

  const {
    drag,
    drop,
    isDragging,
    dropContainerRef,
    dragPosition,
    isOver,
    canDrop,
  } = useDragAndDrop({
    itemId: projectItemId,
    parentId: parentProjectItemId,
    isRoot,
    path,
    onDrop,
    children: projectItem?.children || [],
    parentChildren,
  });

  const moreMenuItems: MenuProps["items"] = useMemo(() => {
    if (projectItem?.projectItemType === EProjectItemType.Document) {
      return [
        projectItem?.refType !== "card"
          ? {
              key: "to-card",
              label: "建立卡片",
            }
          : undefined,
        {
          key: "presentation-mode",
          label: "演示模式",
        },
        {
          key: "export",
          label: "导出文档",
          children: [
            {
              key: "export-markdown",
              label: "Markdown",
            },
            {
              key: "export-image",
              label: "图片",
            },
          ],
        },
        {
          key: "toggle-shortcut",
          label: isShortcut ? "取消快捷方式" : "添加到快捷方式",
        },
        {
          key: "open-in-new-window",
          label: "窗口打开",
        },
        {
          key: "open-in-right-sidebar",
          label: "右侧打开",
        },
        {
          key: "remove",
          label: "删除文档",
        },
      ].filter(isValid);
    }

    if (projectItem?.projectItemType === EProjectItemType.WhiteBoard) {
      return [
        projectItem?.refType !== "white-board"
          ? {
              key: "to-white-board",
              label: "建立白板",
            }
          : undefined,
        {
          key: "toggle-shortcut",
          label: isShortcut ? "取消快捷方式" : "添加到快捷方式",
        },
        {
          key: "remove",
          label: "删除白板",
        },
        {
          key: "edit-title",
          label: "编辑标题",
        },
      ].filter(isValid);
    }

    if (projectItem?.projectItemType === EProjectItemType.VideoNote) {
      return [
        {
          key: "toggle-shortcut",
          label: isShortcut ? "取消快捷方式" : "添加到快捷方式",
        },
        {
          key: "remove",
          label: "删除视频",
        },
        {
          key: "edit-title",
          label: "编辑标题",
        },
      ].filter(isValid);
    }

    if (projectItem?.projectItemType === EProjectItemType.WebView) {
      return [
        {
          key: "toggle-shortcut",
          label: isShortcut ? "取消快捷方式" : "添加到快捷方式",
        },
        {
          key: "remove",
          label: "删除网页",
        },
        {
          key: "edit-title",
          label: "编辑标题",
        },
        {
          key: "open-in-new-tab",
          label: "新 Tab 打开",
        },
      ].filter(isValid);
    }

    if (projectItem?.projectItemType === EProjectItemType.TableView) {
      return [
        {
          key: "toggle-shortcut",
          label: isShortcut ? "取消快捷方式" : "添加到快捷方式",
        },
        {
          key: "remove",
          label: "删除表格",
        },
      ].filter(isValid);
    }
  }, [projectItem?.projectItemType, projectItem?.refType, isShortcut]);

  const handleNotionSyncModalOk = useMemoizedFn(
    async (config: NotionSyncConfig) => {
      if (!projectItem) return;

      const token = setting.integration.notion.token;
      if (!token || !setting.integration.notion.enabled) {
        message.error("请先在设置中配置 Notion 集成");
        return;
      }

      try {
        let pageId = config.pageId;
        const pageTitle = config.pageTitle || "新文档";

        // 如果需要创建新页面
        if (config.createNew && config.parentId) {
          const result = await createNotionPage(
            token,
            config.parentId,
            pageTitle,
            [],
          );

          if (!result.success || !result.pageId) {
            message.error(result.error || "创建 Notion 页面失败");
            return;
          }

          pageId = result.pageId;
        }

        // 创建初始内容
        const initialContent: Descendant[] = [
          {
            type: "paragraph",
            children: [{ type: "formatted", text: "" }],
          },
        ];

        // 计算内容哈希
        const contentHash = generateContentHash(initialContent);

        // 创建 NotionSync 记录
        const notionSync = await createNotionSync({
          pageId,
          syncMode: config.syncMode,
          lastLocalContentHash: contentHash,
          pendingSync: false,
        });

        // 立即同步初始内容到 Notion，避免创建后检测到冲突
        try {
          if (config.syncMode === "json") {
            // JSON 模式：创建代码块
            const jsonContent = JSON.stringify(initialContent, null, 2);
            const result = await appendNotionBlock(token, pageId, {
              type: "code",
              code: {
                rich_text: [
                  {
                    type: "text",
                    text: { content: jsonContent },
                  },
                ],
                language: "javascript",
              },
            });

            // 如果创建成功，更新 codeBlockId
            if (result.success && result.blockId) {
              await updateNotionSync(notionSync.id, {
                codeBlockId: result.blockId,
              });
            }
          }
          // 双向模式下，空内容不需要同步
        } catch (syncError) {
          console.warn("初始同步失败，将在编辑时重试:", syncError);
        }

        // 创建 ProjectItem
        const createProjectItem: CreateProjectItem = {
          title: pageTitle,
          content: initialContent,
          children: [],
          refType: "notion-sync",
          refId: notionSync.id,
          projectItemType: EProjectItemType.Document,
          count: 0,
          whiteBoardContentId: 0,
        };

        const [parentProjectItem] = await addChildProjectItem(
          projectItemId,
          createProjectItem,
        );

        if (parentProjectItem) {
          setProjectItem(parentProjectItem);
          projectItemEventBus.publishProjectItemEvent(
            "project-item:updated",
            parentProjectItem,
          );
        }

        closeModal(ModalKey.NotionSync);
        message.success("Notion 文档创建成功！");
      } catch (error) {
        console.error("创建 Notion 文档失败:", error);
        message.error("创建 Notion 文档失败");
      }
    },
  );

  // 处理编辑标题确认
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
        const newProjectItem = await updateProjectItem({
          ...projectItem,
          title: nextTitle,
        });
        if (newProjectItem) {
          setProjectItem(newProjectItem);
          titleRef.current?.setValue(
            projectItem.projectItemType === EProjectItemType.WebView
              ? textContent
              : nextTitle,
          );
          projectItemEventBus.publishProjectItemEvent(
            "project-item:updated",
            newProjectItem,
          );
        }
      }

      setEditTitleModalOpen(false);
    },
  );

  const handleMoreMenuClick: MenuProps["onClick"] = useMemoizedFn(
    async ({ key }) => {
      if (key === "toggle-shortcut") {
        if (!projectItem) return;
        try {
          if (isShortcut) {
            await deleteShortcut(isShortcut.id);
            message.success("已取消快捷方式");
          } else {
            const shortcutTitle =
              projectItem.projectItemType === EProjectItemType.WebView
                ? projectItemTitle
                : projectItem.title;
            await createShortcut({
              resourceType: "project",
              scope: "item",
              resourceId: projectId,
              projectItemId: projectItem.id,
              title: shortcutTitle || "",
            });
            message.success("已添加到快捷方式");
          }
        } catch (error) {
          console.error("操作快捷方式失败:", error);
          message.error("操作失败");
        }
      } else if (key === "to-card") {
        const projectItem = await getProjectItemById(projectItemId);
        if (!projectItem) return;
        await buildCardFromProjectItem(projectItem);
        message.success("成功建立卡片");
      } else if (key === "to-white-board") {
        if (!projectItem) return;
        if (
          projectItem.projectItemType !== EProjectItemType.WhiteBoard ||
          !projectItem.whiteBoardContentId
        )
          return;
        // 已经关联了白板，不能关联新的白板
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
          // 更新 ProjectItem 的 refType
          const newProjectItem = produce(projectItem, (draft) => {
            draft.refId = createdWhiteBoard.id;
            draft.refType = "white-board";
          });
          const updatedProjectItem = await updateProjectItem(newProjectItem);
          if (!updatedProjectItem) return;
          projectItemEventBus.publishProjectItemEvent(
            "project-item:updated",
            updatedProjectItem,
          );
          message.success("成功创建白板");
        } catch (e) {
          console.error(e);
          message.error("创建白板失败");
        }
      } else if (key === "remove") {
        await onRemoveProjectItem();
      } else if (key === "export-markdown") {
        if (!projectItem) return;
        const markdown = getMarkdown(projectItem.content);
        downloadMarkdown(markdown, projectItem.title);
      } else if (key === "export-image") {
        setExportModalOpen(true);
      } else if (key === "edit-title") {
        setEditTitleModalOpen(true);
      } else if (key === "presentation-mode") {
        if (
          !projectItem ||
          projectItem.projectItemType !== EProjectItemType.Document
        )
          return;
        setIsPresentation(true);
      } else if (key === "open-in-new-window") {
        const databaseName = useSettingStore.getState().setting.database.active;
        openProjectItemInNewWindow(databaseName, projectItemId);
      } else if (key === "open-in-new-tab") {
        if (!projectItem) return;

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
      } else if (key === "open-in-right-sidebar") {
        if (!projectItem) return;

        let targetPaneId: string | undefined;
        if (panes.length > 1) {
          const otherPane = panes.find((p) => p.id !== activePaneId);
          targetPaneId = otherPane?.id;
        }

        openInNewTab(
          TabType.ProjectDetail,
          { id: projectId, itemId: projectItem.id },
          targetPaneId,
          projectItem.title || "项目",
        );
      }
    },
  );

  const handleAddMenuClick: MenuProps["onClick"] = useMemoizedFn(
    async ({ key }) => {
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
        const [parentProjectItem] = await addChildProjectItem(
          projectItemId,
          createProjectItem,
        );
        if (parentProjectItem) {
          setProjectItem(parentProjectItem);
          projectItemEventBus.publishProjectItemEvent(
            "project-item:updated",
            parentProjectItem,
          );
        }
      } else if (key === "add-notion-document-project-item") {
        openModal(ModalKey.NotionSync);
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
        const [parentProjectItem] = await addChildProjectItem(
          projectItemId,
          createProjectItem,
        );
        if (parentProjectItem) {
          setProjectItem(parentProjectItem);
          projectItemEventBus.publishProjectItemEvent(
            "project-item:updated",
            parentProjectItem,
          );
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
        const [parentProjectItem] = await addChildProjectItem(
          projectItemId,
          createProjectItem,
        );
        if (parentProjectItem) {
          setProjectItem(parentProjectItem);
          projectItemEventBus.publishProjectItemEvent(
            "project-item:updated",
            parentProjectItem,
          );
        }
      } else if (key === "add-remote-video-note-project-item") {
        openModal(ModalKey.WebVideo);
      } else if (key === "add-bilibili-video-note-project-item") {
        openModal(ModalKey.Bilibili);
      } else if (key === "add-youtube-video-note-project-item") {
        openModal(ModalKey.Youtube);
      } else if (key === "add-notion-video-note-project-item") {
        openModal(ModalKey.Notion);
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
        const [parentProjectItem] = await addChildProjectItem(
          projectItemId,
          createProjectItem,
        );
        if (parentProjectItem) {
          setProjectItem(parentProjectItem);
          projectItemEventBus.publishProjectItemEvent(
            "project-item:updated",
            parentProjectItem,
          );
        }
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
        }).catch((e) => {
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
            projectItemEventBus.publishProjectItemEvent(
              "project-item:updated",
              parentProjectItem,
            );
          }
        }
      }
    },
  );

  const initialCardContents = useMemo(() => {
    return cards.map((card) => ({
      id: card.id,
      contentId: card.contentId,
      type: "card" as IndexType,
      title: "",
      content: card.content,
      source: "fts" as "fts" | "vec-document",
      updateTime: card.update_time,
    }));
  }, [cards]);

  const handleCardSelect = async (
    selectedResults: SearchResult | SearchResult[],
  ) => {
    const results = Array.isArray(selectedResults)
      ? selectedResults
      : [selectedResults];
    const selectedCardIds = results.map((result) => result.id);
    const newSelectedCards = selectedCardIds
      .map((id) => cards.find((card) => card.id === id))
      .filter((card): card is ICard => !!card);

    const res = await onCardOk(newSelectedCards);
    if (res) {
      const [parentProjectItem] = res;
      if (parentProjectItem) {
        setProjectItem(parentProjectItem as ProjectItem);
        projectItemEventBus.publishProjectItemEvent(
          "project-item:updated",
          parentProjectItem as ProjectItem,
        );
      }
    }
  };

  if (!projectItem) return null;

  return (
    <>
      <div
        ref={drag}
        className={classnames("transition-opacity", {
          "opacity-50": isDragging,
        })}
      >
        <div
          ref={(node) => {
            dropContainerRef.current = node;
            drop(node);
          }}
          className={classnames(
            "relative flex cursor-pointer items-center justify-between rounded-[8px] border border-transparent px-[8px] py-[4px] transition-all duration-200 min-w-0",
            {
              [activeClass]: itemId === projectItem.id,
              [hoverClass]: itemId !== projectItem.id,
              [TOP_DROP_INDICATOR_CLASS]:
                isOver && canDrop && dragPosition === EDragPosition.Top,
              [BOTTOM_DROP_INDICATOR_CLASS]:
                isOver && canDrop && dragPosition === EDragPosition.Bottom,
              [INSIDE_DROP_INDICATOR_CLASS]:
                isOver && canDrop && dragPosition === EDragPosition.Inside,
            },
          )}
          onClick={async () => {
            const activeProjectItem = await getProjectItemById(projectItem.id);
            if (!activeProjectItem) return;
            const displayTitle =
              projectItem.projectItemType === EProjectItemType.WebView
                ? projectItemTitle
                : projectItem.title;
            navigateTo(
              TabType.ProjectDetail,
              {
                id: projectId,
                itemId: projectItem.id,
              },
              `项目 - ${displayTitle || `#${projectItem.id}`}`,
            );
          }}
        >
          <div className="flex min-h-[30px] items-center gap-[8px] overflow-hidden min-w-0 flex-1">
            <Tooltip
              title={
                projectItem.children.length > 0
                  ? folderOpen
                    ? "收起"
                    : "展开"
                  : undefined
              }
              mouseEnterDelay={1}
            >
              <div
                className={classnames(
                  "flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full transition-colors duration-200",
                  {
                    [`cursor-pointer ${hoverClass}`]:
                      projectItem.children.length > 0,
                  },
                )}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (projectItem.children.length === 0) return;
                  setFolderOpen(!folderOpen);
                }}
              >
                {projectItem.children.length > 0 ? (
                  <FolderOpenTwoTone />
                ) : projectItem.projectItemType ===
                  EProjectItemType.WhiteBoard ? (
                  <SVG src={whiteBoardIcon} />
                ) : projectItem.projectItemType ===
                  EProjectItemType.VideoNote ? (
                  <VideoCameraOutlined />
                ) : projectItem.projectItemType === EProjectItemType.WebView ? (
                  <GlobalOutlined />
                ) : projectItem.projectItemType ===
                  EProjectItemType.TableView ? (
                  <TableOutlined />
                ) : (
                  <FileOutlined />
                )}
              </div>
            </Tooltip>
            <div className="flex-1 min-w-0 overflow-hidden">
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
                    className={classnames(
                      "w-full min-w-0 truncate leading-[32px] max-w-full",
                      {
                        [`rounded border ${borderClass} px-2 whitespace-normal`]:
                          titleEditable,
                      },
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
                        (projectItem.projectItemType ===
                        EProjectItemType.WebView
                          ? projectItemTitle
                          : projectItem?.title) ||
                        "";
                      setTitleEditable(false);

                      let nextTitle = textContent;
                      if (
                        projectItem.projectItemType === EProjectItemType.WebView
                      ) {
                        if (webLinkId) {
                          updateWebLink({
                            id: webLinkId,
                            title: textContent,
                          }).catch((err) =>
                            console.error("更新网页标题失败:", err),
                          );
                        } else if (displayWebviewUrl) {
                          nextTitle = `${textContent} [${displayWebviewUrl}]`;
                        }
                      }

                      if (nextTitle !== projectItem.title) {
                        updateProjectItem({
                          ...projectItem,
                          title: nextTitle,
                        }).then((newProjectItem) => {
                          if (!newProjectItem) return;
                          setProjectItem(newProjectItem);
                          setTitleEditable(false);
                          titleRef.current?.setContentEditable(false);
                          projectItemEventBus.publishProjectItemEvent(
                            "project-item:updated",
                            newProjectItem,
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
            onClick={(e) => {
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
              "grid-rows-[0fr] my-0":
                !folderOpen || projectItem.children.length === 0,
            },
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
      <RemoteVideoSelectModal
        open={modalStates.webVideo}
        onCancel={() => closeModal(ModalKey.WebVideo)}
        onConfirm={handleRemoteConfirm}
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

      <NotionVideoSelectModal
        open={modalStates.notion}
        onCancel={() => closeModal(ModalKey.Notion)}
        onConfirm={handleNotionConfirm}
      />

      <NotionSyncModal
        open={modalStates.notionSync}
        token={setting.integration.notion.token}
        onOk={handleNotionSyncModalOk}
        onCancel={() => closeModal(ModalKey.NotionSync)}
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
    </>
  );
});

export default ProjectItem;
