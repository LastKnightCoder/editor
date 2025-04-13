import { useState, useEffect, memo, useRef, useMemo } from "react";
import classnames from "classnames";
import { useCreation, useLocalStorageState, useMemoizedFn } from "ahooks";
import { App, Dropdown, Input, MenuProps, message, Modal, Tooltip } from "antd";
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
  nodeFetch,
  createWhiteBoardContent,
  addChildProjectItem,
  removeRootProjectItem,
  removeChildProjectItem,
} from "@/commands";

import SelectWhiteBoardModal from "@/components/SelectWhiteBoardModal";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import useProjectsStore from "@/stores/useProjectsStore";
import useWhiteBoardStore from "@/stores/useWhiteBoardStore";
import useSettingStore from "@/stores/useSettingStore";
import useDragAndDrop, {
  EDragPosition,
  IDragItem,
} from "@/hooks/useDragAndDrop";
import useAddRefCard from "./useAddRefCard";
import useAddRefWhiteBoard from "../useAddRefWhiteBoard";

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
} from "@/types";
import { IExtension } from "@/components/Editor";
import {
  FileOutlined,
  FolderOpenTwoTone,
  MoreOutlined,
  PlusOutlined,
  GlobalOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import {
  getContentLength,
  getEditorText,
  importFromMarkdown,
  webClipFromUrl,
  defaultProjectItemEventBus,
  getMarkdown,
  downloadMarkdown,
} from "@/utils";
import whiteBoardIcon from "@/assets/icons/white-board.svg";

import styles from "./index.module.less";
import { isValid } from "@/components/WhiteBoard/utils";
import EditText, { EditTextHandle } from "@/components/EditText";
import PresentationMode from "@/components/PresentationMode";
import useRightSidebarStore from "@/stores/useRightSidebarStore";
import { useProjectContext } from "../../ProjectContext";

const extractUrlFromTitle = (title: string): { title: string; url: string } => {
  const urlRegex = /\[(https?:\/\/[^\]]+)\]$/;
  const match = title.match(urlRegex);

  if (match && match[1]) {
    return {
      title: title.replace(urlRegex, "").trim(),
      url: match[1],
    };
  }

  return { title, url: "" };
};

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

  const projectItemEventBus = useCreation(
    () => defaultProjectItemEventBus.createEditor(),
    [],
  );

  const { projectId } = useProjectContext();
  const databaseName = useSettingStore.getState().setting.database.active;

  const [webClipModalOpen, setWebClipModalOpen] = useState(false);
  const [webClip, setWebClip] = useState("");
  const [titleEditable, setTitleEditable] = useState(false);
  const titleRef = useRef<EditTextHandle>(null);
  const parserControllerRef = useRef<AbortController>();
  const [parseLoading, setParseLoading] = useState(false);
  const [projectItem, setProjectItem] = useState<ProjectItem>();
  const [folderOpen, setFolderOpen] = useLocalStorageState<boolean>(
    `project-item-${databaseName}-${projectItemId}`,
    {
      defaultValue: () => {
        return path.length === 1;
      },
    },
  );
  const [webVideoModalOpen, setWebVideoModalOpen] = useState(false);
  const [webVideoUrl, setWebVideoUrl] = useState("");
  const [extensions, setExtensions] = useState<IExtension[]>([]);
  const [webviewModalOpen, setWebviewModalOpen] = useState(false);
  const [webviewUrl, setWebviewUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const { updateProject, activeProjectItemId } = useProjectsStore((state) => ({
    updateProject: state.updateProject,
    activeProjectItemId: state.activeProjectItemId,
  }));

  useEffect(() => {
    if (activeProjectItemId === projectItemId) {
      setFolderOpen(true);
      onOpenChange?.(true);
    }
  }, [activeProjectItemId]);

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
        if (activeProjectItemId === projectItemId) {
          useProjectsStore.setState({
            activeProjectItemId: null,
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
      // 先删掉原来的位置，在新的位置插入
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
          activeProjectItemId &&
          [dragId, dragParentId, projectItemId, parentProjectItemId].includes(
            activeProjectItemId,
          )
        ) {
          needRefreshId.push(activeProjectItemId);
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
          key: "export-markdown",
          label: "导出文档",
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
          key: "remove",
          label: "删除网页",
        },
        {
          key: "edit-title",
          label: "编辑标题",
        },
        {
          key: "open-in-right-sidebar",
          label: "右侧打开",
        },
      ].filter(isValid);
    }
  }, [projectItem?.projectItemType, projectItem?.refType]);

  const handleMoreMenuClick: MenuProps["onClick"] = useMemoizedFn(
    async ({ key }) => {
      if (key === "to-card") {
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
      } else if (key === "edit-title") {
        setTitleEditable(true);
        titleRef.current?.setContentEditable(true);
        titleRef.current?.focusEnd();
        titleRef.current?.selectAll();
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
      } else if (key === "open-in-right-sidebar") {
        if (!projectItem) return;

        const { addTab } = useRightSidebarStore.getState();

        if (projectItem.projectItemType === EProjectItemType.WebView) {
          const { title, url } = extractUrlFromTitle(projectItem.title);
          if (url) {
            addTab({
              id: url,
              title,
              type: "webview",
            });
          } else {
            message.error("无法提取 URL");
          }
        } else {
          addTab({
            id: String(projectItem.id),
            title: projectItem.title || "项目",
            type: "project-item",
          });
        }
      }
    },
  );

  const addMenuItems: MenuProps["items"] = [
    {
      key: "add-project-item",
      label: "添加文档",
    },
    {
      key: "add-white-board-project-item",
      label: "添加白板",
    },
    {
      key: "add-video-note-project-item",
      label: "添加视频",
      children: [
        {
          key: "add-local-video-note-project-item",
          label: "本地视频",
        },
        {
          key: "add-remote-video-note-project-item",
          label: "远程视频",
        },
      ],
    },
    {
      key: "add-webview-project-item",
      label: "添加网页",
    },
    {
      key: "link-card-project-item",
      label: "关联卡片",
    },
    {
      key: "link-white-board-project-item",
      label: "关联白板",
    },
    {
      key: "import-markdown",
      label: "导入Markdown",
    },
    {
      key: "add-web-project-item",
      label: "解析网页",
    },
  ];

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
      } else if (key === "add-white-board-project-item") {
        if (!projectItemId) return;
        const whiteBoardContent = await createWhiteBoardContent({
          name: "新白板",
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
        setWebVideoModalOpen(true);
      } else if (key === "add-webview-project-item") {
        setWebviewModalOpen(true);
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
      } else if (key === "add-web-project-item") {
        setWebClipModalOpen(true);
      }
    },
  );

  useEffect(() => {
    import("@/editor-extensions").then(
      ({
        cardLinkExtension,
        fileAttachmentExtension,
        questionCardExtension,
      }) => {
        setExtensions([
          cardLinkExtension,
          fileAttachmentExtension,
          questionCardExtension,
        ]);
      },
    );
  }, []);

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
        className={classnames(styles.item, {
          [styles.dragging]: isDragging,
        })}
      >
        <div
          ref={(node) => {
            dropContainerRef.current = node;
            drop(node);
          }}
          className={classnames(styles.header, {
            [styles.active]: activeProjectItemId === projectItem.id,
            [styles.top]:
              isOver && canDrop && dragPosition === EDragPosition.Top,
            [styles.bottom]:
              isOver && canDrop && dragPosition === EDragPosition.Bottom,
            [styles.inside]:
              isOver && canDrop && dragPosition === EDragPosition.Inside,
          })}
          onClick={async () => {
            const activeProjectItem = await getProjectItemById(projectItem.id);
            if (!activeProjectItem) return;
            const headers = activeProjectItem.content.filter(
              (node) => node.type === "header",
            );
            useProjectsStore.setState({
              activeProjectItemId: projectItem.id,
              showOutline: headers.length > 0,
            });
          }}
        >
          <Tooltip title={projectItem.title} trigger={"hover"}>
            <div className={styles.titleContainer}>
              <Tooltip
                title={
                  projectItem.children.length > 0
                    ? folderOpen
                      ? "收起"
                      : "展开"
                    : undefined
                }
              >
                <div
                  className={classnames(styles.icon, {
                    [styles.hoverable]: projectItem.children.length > 0,
                  })}
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
                  ) : projectItem.projectItemType ===
                    EProjectItemType.WebView ? (
                    <GlobalOutlined />
                  ) : (
                    <FileOutlined />
                  )}
                </div>
              </Tooltip>
              <EditText
                className={classnames(styles.title, {
                  [styles.editing]: titleEditable,
                })}
                key={projectItem.id}
                ref={titleRef}
                defaultValue={
                  projectItem.projectItemType === EProjectItemType.WebView
                    ? extractUrlFromTitle(projectItem.title).title
                    : projectItem.title
                }
                contentEditable={titleEditable}
                onPressEnter={() => {
                  let textContent =
                    titleRef.current?.getValue() || projectItem?.title;

                  setTitleEditable(false);

                  // 如果是 WebView 类型，需要保留原来的 URL
                  if (
                    projectItem.projectItemType === EProjectItemType.WebView
                  ) {
                    const { url } = extractUrlFromTitle(projectItem.title);
                    if (url) {
                      textContent = `${textContent} [${url}]`;
                    }
                  }

                  if (textContent !== projectItem.title) {
                    // 更新标题
                    updateProjectItem({
                      ...projectItem,
                      title: textContent,
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
          <div
            onClick={(e) => {
              e.stopPropagation();
            }}
            className={styles.icons}
          >
            <Dropdown
              menu={{
                items: moreMenuItems,
                onClick: handleMoreMenuClick,
              }}
            >
              <div className={styles.icon}>
                <MoreOutlined />
              </div>
            </Dropdown>
            <Dropdown
              menu={{
                items: addMenuItems,
                onClick: handleAddMenuClick,
              }}
            >
              <div className={styles.icon}>
                <PlusOutlined />
              </div>
            </Dropdown>
          </div>
        </div>
        <div
          className={classnames(styles.gridContainer, {
            [styles.hide]: !folderOpen || projectItem.children.length === 0,
          })}
        >
          <div className={styles.children}>
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
      <Modal
        open={webClipModalOpen}
        title={"添加网页"}
        confirmLoading={parseLoading}
        maskClosable={!parseLoading}
        onOk={async () => {
          if (!projectItem || !projectId) {
            return;
          }
          setParseLoading(true);
          if (parserControllerRef.current) {
            parserControllerRef.current.abort();
          }
          parserControllerRef.current = new AbortController();
          parserControllerRef.current.signal.addEventListener("abort", () => {
            setParseLoading(false);
          });

          if (parserControllerRef.current.signal.aborted) {
            return;
          }

          message.loading({
            key: "web-clip",
            content: "正在处理...",
            duration: 0,
          });

          const res = await webClipFromUrl(webClip).catch(() => {
            return {
              result: false,
              error: "未知错误",
              value: [],
            };
          });

          if (res.result && res.value) {
            let title = "新文档";
            if (res.value.length > 0) {
              if (res.value[0].type === "header") {
                title = getEditorText(res.value[0].children);
                res.value = res.value.slice(1);
              }
            }

            if (parserControllerRef.current.signal.aborted) {
              return;
            }

            const createProjectItem: CreateProjectItem = {
              title,
              content: res.value,
              children: [],
              refType: "",
              refId: 0,
              projectItemType: EProjectItemType.Document,
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

            setWebClip("");
            setWebClipModalOpen(false);
            setParseLoading(false);
            message.success({
              key: "web-clip",
              content: "添加成功",
            });
          } else {
            message.error({
              key: "web-clip",
              content: res.error || "未知错误",
            });
            console.error(res);
            setParseLoading(false);
          }

          parserControllerRef.current = undefined;
        }}
        onCancel={() => {
          setWebClip("");
          setWebClipModalOpen(false);
          parserControllerRef.current?.abort();
          parserControllerRef.current = undefined;
          message.destroy();
        }}
      >
        <Input
          value={webClip}
          onChange={(e) => setWebClip(e.target.value)}
          placeholder="请输入网址"
        />
      </Modal>
      <Modal
        open={webVideoModalOpen}
        onCancel={() => setWebVideoModalOpen(false)}
        onOk={async () => {
          if (!projectItem || !projectId) {
            message.error("项目文档尚未加载完成");
            return;
          }
          const item = await createEmptyVideoNote({
            type: "remote",
            url: webVideoUrl,
          });
          if (!item) {
            message.error("创建视频笔记失败");
            return;
          }
          const createProjectItem: CreateProjectItem = {
            title: webVideoUrl,
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
          setWebVideoModalOpen(false);
          setWebVideoUrl("");
        }}
      >
        <Input
          placeholder="请输入网址"
          value={webVideoUrl}
          onChange={(e) => setWebVideoUrl(e.target.value)}
        />
      </Modal>

      <Modal
        open={webviewModalOpen}
        title={"添加网页"}
        confirmLoading={loading}
        onCancel={() => {
          setWebviewModalOpen(false);
          setWebviewUrl("");
        }}
        onOk={async () => {
          if (!projectItem || !projectId) {
            message.error("项目文档尚未加载完成");
            return;
          }

          if (!webviewUrl) {
            message.error("请输入网址");
            return;
          }

          setLoading(true);

          try {
            // 尝试获取网页标题
            let title = webviewUrl;

            try {
              // 使用 node-fetch 获取网页元信息
              const response = await nodeFetch(webviewUrl, {
                method: "GET",
                timeout: 5000,
              });

              // 从 HTML 中提取标题
              if (typeof response === "string") {
                const titleMatch = response.match(
                  /<title[^>]*>([^<]+)<\/title>/i,
                );
                if (titleMatch && titleMatch[1]) {
                  title = titleMatch[1].trim();
                }
              }
            } catch (error) {
              console.error("获取网页标题失败:", error);
            }

            const formattedTitle = `${title} [${webviewUrl}]`;

            const createProjectItem: CreateProjectItem = {
              title: formattedTitle,
              content: [],
              children: [],
              refType: "",
              refId: 0,
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

            setWebviewModalOpen(false);
            setWebviewUrl("");
          } catch (error) {
            message.error("添加网页失败");
            console.error(error);
          } finally {
            setLoading(false);
          }
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="请输入网址，例如 https://www.example.com"
            prefix={<GlobalOutlined />}
            value={webviewUrl}
            onChange={(e) => setWebviewUrl(e.target.value)}
            autoFocus
          />
        </div>
      </Modal>

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
    </>
  );
});

export default ProjectItem;
