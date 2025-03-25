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
} from "@/commands";

import SelectCardModal from "@/components/SelectCardModal";
import SelectWhiteBoardModal from "@/components/SelectWhiteBoardModal";
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
import { CreateProjectItem, EProjectItemType, type ProjectItem } from "@/types";
import {
  FileOutlined,
  FolderOpenTwoTone,
  MoreOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  getContentLength,
  getEditorText,
  importFromMarkdown,
  webClipFromUrl,
  defaultProjectItemEventBus,
} from "@/utils";
import whiteBoardIcon from "@/assets/icons/white-board.svg";

import styles from "./index.module.less";
import { isValid } from "@/components/WhiteBoard/utils";
import EditText, { EditTextHandle } from "@/components/EditText";
import PresentationMode from "@/components/PresentationMode";
import useRightSidebarStore from "@/stores/useRightSidebarStore";
import { useProjectContext } from "../../ProjectContext";

interface IProjectItemProps {
  projectItemId: number;
  parentProjectItemId: number;
  isRoot?: boolean;
  path: number[];
  parentChildren: number[];
}

const ProjectItem = memo((props: IProjectItemProps) => {
  const {
    projectItemId,
    isRoot = false,
    parentProjectItemId,
    path,
    parentChildren,
  } = props;

  const projectItemEventBus = useCreation(
    () => defaultProjectItemEventBus.createEditor(),
    [],
  );

  const { projectId } = useProjectContext();

  const [webClipModalOpen, setWebClipModalOpen] = useState(false);
  const [webClip, setWebClip] = useState("");
  const [titleEditable, setTitleEditable] = useState(false);
  const titleRef = useRef<EditTextHandle>(null);
  const parserControllerRef = useRef<AbortController>();
  const [parseLoading, setParseLoading] = useState(false);
  const [projectItem, setProjectItem] = useState<ProjectItem>();
  const [folderOpen, setFolderOpen] = useLocalStorageState<boolean>(
    `${projectId}-${projectItemId}`,
    {
      defaultValue: () => {
        return path.length === 1;
      },
    },
  );

  const {
    cards,
    selectCardModalOpen,
    openSelectCardModal,
    selectedCards,
    excludeCardIds,
    onOk: onCardOk,
    onCancel: onCardCancel,
    onChange: onCardChange,
    buildCardFromProjectItem,
  } = useAddRefCard(projectId, projectItem);
  const {
    whiteBoards,
    selectWhiteBoardModalOpen,
    openSelectWhiteBoardModal,
    selectedWhiteBoards,
    excludeWhiteBoardIds,
    onOk: onWhiteBoardOk,
    onCancel: onWhiteBoardCancel,
    onChange: onWhiteBoardChange,
    multiple,
  } = useAddRefWhiteBoard(projectId, projectItem);
  const { modal } = App.useApp();
  const [isPresentation, setIsPresentation] = useState(false);

  const refresh = useMemoizedFn((projectItemId) => {
    getProjectItemById(projectItemId).then((projectItem) => {
      setProjectItem(projectItem);
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
  }, [projectItemId]);

  const {
    updateProject,
    activeProjectItemId,
    removeChildProjectItem,
    removeRootProjectItem,
    createChildProjectItem,
  } = useProjectsStore((state) => ({
    updateProject: state.updateProject,
    activeProjectItemId: state.activeProjectItemId,
    removeRootProjectItem: state.removeRootProjectItem,
    removeChildProjectItem: state.removeChildProjectItem,
    createChildProjectItem: state.createChildProjectItem,
  }));

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
          }
        } else {
          if (parentProjectItemId) {
            await removeChildProjectItem(parentProjectItemId, projectItemId);
            const updatedProjectItem =
              await getProjectItemById(parentProjectItemId);
            defaultProjectItemEventBus
              .createEditor()
              .publishProjectItemEvent(
                "project-item:updated",
                updatedProjectItem,
              );
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
            await removeRootProjectItem(projectId, dragId);
          }
        } else {
          if (dragParentId) {
            await removeChildProjectItem(dragParentId, dragId);
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
    return projectItem?.projectItemType === EProjectItemType.Document
      ? [
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
        ].filter(isValid)
      : [
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
  }, [projectItem?.projectItemType, projectItem?.refType]);

  const handleMoreMenuClick: MenuProps["onClick"] = useMemoizedFn(
    async ({ key }) => {
      if (key === "to-card") {
        const projectItem = await getProjectItemById(projectItemId);
        await buildCardFromProjectItem(projectItem);
        message.success("成功建立卡片");
      } else if (key === "to-white-board") {
        if (!projectItem) return;
        if (
          projectItem.projectItemType !== EProjectItemType.WhiteBoard ||
          !projectItem.whiteBoardData
        )
          return;
        // 已经关联了白板，不能关联新的白板
        if (projectItem.refType === "white-board") return;
        const createWhiteBoardData = {
          title: projectItem.title,
          description: projectItem.title,
          tags: [],
          data: projectItem.whiteBoardData,
          snapshot: "",
          isProjectItem: true,
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
      } else if (key === "edit-title") {
        setTitleEditable(true);
        titleRef.current?.setContentEditable(true);
        titleRef.current?.focusEnd();
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
        addTab({
          id: String(projectItem.id),
          title: projectItem.title || "项目",
          type: "project-item",
        });
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
          parents: [projectItemId],
          projects: [],
          refType: "",
          refId: 0,
          projectItemType: EProjectItemType.Document,
          count: 0,
        };
        await createChildProjectItem(
          projectId,
          projectItemId,
          createProjectItem,
        );
        const updatedProjectItem = await getProjectItemById(projectItemId);
        setProjectItem(updatedProjectItem);
        projectItemEventBus.publishProjectItemEvent(
          "project-item:updated",
          updatedProjectItem,
        );
      } else if (key === "add-white-board-project-item") {
        if (!projectItemId) return;
        const createProjectItem: CreateProjectItem = {
          title: "新白板",
          content: [],
          whiteBoardData: {
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
          },
          children: [],
          parents: [projectItemId],
          projects: [],
          refType: "",
          refId: 0,
          projectItemType: EProjectItemType.WhiteBoard,
          count: 0,
        };
        await createChildProjectItem(
          projectId,
          projectItemId,
          createProjectItem,
        );
        const updatedProjectItem = await getProjectItemById(projectItemId);
        projectItemEventBus.publishProjectItemEvent(
          "project-item:updated",
          updatedProjectItem,
        );
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
          const content = importFromMarkdown(markdown);
          const fileName = await getFileBaseName(path, true);
          await createChildProjectItem(projectId, projectItem.id, {
            title: fileName,
            content,
            children: [],
            parents: [projectItem.id],
            projects: [],
            refType: "",
            refId: 0,
            projectItemType: EProjectItemType.Document,
            count: getContentLength(content),
          });
        }
        const updatedProjectItem = await getProjectItemById(projectItemId);
        projectItemEventBus.publishProjectItemEvent(
          "project-item:updated",
          updatedProjectItem,
        );
      } else if (key === "add-web-project-item") {
        setWebClipModalOpen(true);
      }
    },
  );

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
                ) : (
                  <FileOutlined />
                )}
              </div>
            </Tooltip>
            <EditText
              className={styles.title}
              key={projectItem.id}
              ref={titleRef}
              defaultValue={projectItem.title}
              contentEditable={titleEditable}
              onPressEnter={() => {
                const textContent =
                  titleRef.current?.getValue() || projectItem?.title;
                setTitleEditable(false);
                if (textContent !== projectItem.title) {
                  // 更新标题
                  updateProjectItem({
                    ...projectItem,
                    title: textContent,
                  }).then((newProjectItem) => {
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
                />
              )}
            />
          </div>
        </div>
      </div>
      <SelectCardModal
        title={"选择关联卡片"}
        selectedCards={selectedCards}
        onChange={onCardChange}
        open={selectCardModalOpen}
        allCards={cards}
        onCancel={onCardCancel}
        onOk={onCardOk}
        excludeCardIds={excludeCardIds}
      />
      <SelectWhiteBoardModal
        title={"选择关联白板"}
        selectedWhiteBoards={selectedWhiteBoards}
        onChange={onWhiteBoardChange}
        open={selectWhiteBoardModalOpen}
        allWhiteBoards={whiteBoards}
        onCancel={onWhiteBoardCancel}
        onOk={onWhiteBoardOk}
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
              parents: [projectItem.id],
              projects: [projectId],
              refType: "",
              refId: 0,
              projectItemType: EProjectItemType.Document,
              count: 0,
            };

            await createChildProjectItem(
              projectId,
              projectItem.id,
              createProjectItem,
            );
            const updatedProjectItem = await getProjectItemById(projectItem.id);
            projectItemEventBus.publishProjectItemEvent(
              "project-item:updated",
              updatedProjectItem,
            );

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
