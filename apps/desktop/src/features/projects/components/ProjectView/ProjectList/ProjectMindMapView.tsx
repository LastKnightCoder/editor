import { memo, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tooltip } from "@tau/ui";
import { Dropdown, MenuProps } from "antd";
import { Book, FileText, FolderOpen, Globe, Plus, Table, Video } from "lucide-react";
import { AudioLines } from "lucide-react";
import { useDrag, useDrop } from "react-dnd";
import classnames from "classnames";
import EditText, { EditTextHandle } from "@/components/EditText";
import MindMap from "@/components/MindMap";
import type { MindMapNodeActionContext } from "@/components/MindMap";
import { MindMapNodeData } from "@/components/MindMap/types";
import { EProjectItemType, Epub, ICard, Pdf, Project, WhiteBoard } from "@/types";
import { TabType } from "@/types/tab";
import { EDragPosition, IDragItem, type as sidebarDragType } from "@/hooks/useDragAndDrop";
import useTabStore from "@/stores/useTabStore";
import { updateProjectItem } from "@/commands";
import { defaultProjectItemEventBus } from "@/utils";
import { ProjectTreeData, canMoveProjectTreeItem } from "@/utils/projectTree";
import {
  buildMindMapDropGuide,
  getMindMapDropPlacement,
  MindMapDropPlacement,
} from "@/utils/mindMapTreeUtils";
import { useProjectTreeOperations } from "./useProjectTreeOperations";
import {
  ProjectMindMapNodeMeta,
  buildProjectMindMapData,
  getProjectMindMapNodeId,
  getProjectMindMapRootId,
  parseProjectMindMapItemId,
} from "./projectMindMap";
import useProjectItemMoreActions from "./ProjectItem/useProjectItemMoreActions";

interface ProjectMindMapViewProps {
  project: Project;
  treeData: ProjectTreeData;
  activeItemId?: number;
  databaseName: string;
  cards: ICard[];
  whiteBoards: WhiteBoard[];
  pdfs: Pdf[];
  epubs: Epub[];
  addMenuItems: MenuProps["items"];
  onAddMenuClick: (
    info: Parameters<NonNullable<MenuProps["onClick"]>>[0],
    parentProjectItemId?: number
  ) => void;
  refreshProject: () => void;
  reloadTree: (options?: { silent?: boolean }) => void | Promise<void>;
  initialPan?: { x: number; y: number };
  initialZoom?: number;
  onViewportChange?: (viewport: { pan: { x: number; y: number }; zoom: number }) => void;
}

const getItemIcon = (type?: EProjectItemType, hasChildren = false) => {
  if (hasChildren) return <FolderOpen />;
  if (!type) return <FolderOpen />;
  if (type === EProjectItemType.WhiteBoard) return <FolderOpen />;
  if (type === EProjectItemType.VideoNote) return <Video />;
  if (type === EProjectItemType.AudioNote) return <AudioLines size={14} />;
  if (type === EProjectItemType.WebView) return <Globe />;
  if (type === EProjectItemType.TableView) return <Table />;
  if (type === EProjectItemType.Pdf) return <FileText className="text-red-500" />;
  if (type === EProjectItemType.Epub) return <Book />;
  return <FileText />;
};

const PROJECT_NODE_SELECTOR = "data-project-mindmap-node-id";
const PROJECT_ROOT_SELECTOR = "data-project-mindmap-root";

const isDropPlacementAllowed = (
  placement: MindMapDropPlacement | null,
  dragItem: IDragItem,
  treeData: ProjectTreeData
) => {
  if (!placement) return false;
  if (dragItem.parentId === placement.parentId && dragItem.isRoot === placement.parentIsRoot) {
    const currentIndex = dragItem.parentChildren.findIndex(id => id === dragItem.itemId);
    if (
      currentIndex >= 0 &&
      (placement.insertIndex === currentIndex || placement.insertIndex === currentIndex + 1)
    ) {
      return false;
    }
  }

  const parentChildren = placement.parentIsRoot
    ? treeData.nodes.map(node => node.item.id)
    : treeData.itemMap.get(placement.parentId)?.children;

  return canMoveProjectTreeItem({
    treeData,
    dragItem,
    dropTargetId: placement.referenceNodeId
      ? (treeData.nodeMap.get(placement.referenceNodeId)?.item.id ?? dragItem.itemId)
      : placement.parentId,
    dragPosition:
      placement.indicator === "inside"
        ? EDragPosition.Inside
        : placement.indicator === "top"
          ? EDragPosition.Top
          : EDragPosition.Bottom,
    insertParentId: placement.parentId,
    insertParentChildren: parentChildren,
    insertParentIsRoot: placement.parentIsRoot,
  });
};

const ProjectMindMapItemActions = memo(
  ({
    content,
    meta,
    activeItemId,
    reloadTree,
    refreshProject,
    startEditing,
  }: {
    content: ReactNode;
    meta: ProjectMindMapNodeMeta;
    activeItemId?: number;
    reloadTree: ProjectMindMapViewProps["reloadTree"];
    refreshProject: ProjectMindMapViewProps["refreshProject"];
    startEditing: () => void;
  }) => {
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const { moreMenuItems, handleMoreMenuClick, moreActionModals } = useProjectItemMoreActions({
      projectId: meta.projectId,
      projectItem: meta.projectItem,
      parentProjectItemId: meta.parentId || meta.projectId,
      isRoot: Boolean(meta.isRoot),
      activeItemId,
      refreshProject,
      reloadTree,
      onProjectItemChange: () => {
        void reloadTree({ silent: true });
      },
      onRequestInlineTitleEdit: startEditing,
    });

    useEffect(() => {
      if (!moreMenuOpen) return;
      const closeMenu = () => setMoreMenuOpen(false);
      window.addEventListener("mindmap:canvas-pointer-down", closeMenu);
      return () => {
        window.removeEventListener("mindmap:canvas-pointer-down", closeMenu);
      };
    }, [moreMenuOpen]);

    if (!moreMenuItems || moreMenuItems.length === 0) {
      return (
        <>
          {content}
          {moreActionModals}
        </>
      );
    }

    return (
      <>
        <Dropdown
          open={moreMenuOpen}
          onOpenChange={setMoreMenuOpen}
          menu={{
            items: moreMenuItems,
            onClick: info => {
              info.domEvent.stopPropagation();
              setMoreMenuOpen(false);
              handleMoreMenuClick?.(info);
            },
          }}
          trigger={["contextMenu"]}
        >
          {content}
        </Dropdown>
        {moreActionModals}
      </>
    );
  }
);

ProjectMindMapItemActions.displayName = "ProjectMindMapItemActions";

const MindMapNodeContent = memo(
  ({
    node,
    onRename,
    reloadTree,
    activeItemId,
    refreshProject,
    activeDropPlacement,
  }: {
    node: MindMapNodeData;
    onRename: (meta: ProjectMindMapNodeMeta, title: string) => void;
    reloadTree: ProjectMindMapViewProps["reloadTree"];
    activeItemId?: number;
    refreshProject: ProjectMindMapViewProps["refreshProject"];
    activeDropPlacement: MindMapDropPlacement | null;
  }) => {
    const meta = node.meta as ProjectMindMapNodeMeta;
    const nodeRef = useRef<HTMLDivElement | null>(null);
    const titleRef = useRef<EditTextHandle>(null);
    const [editing, setEditing] = useState(false);
    const isProject = meta.nodeKind === "project";
    const startEditing = useCallback(() => {
      setEditing(true);
      requestAnimationFrame(() => {
        titleRef.current?.setContentEditable(true);
        titleRef.current?.focusEnd();
      });
    }, []);
    const canDrag = meta.nodeKind === "project-item" && Boolean(meta.projectItemId);
    const dragItem: IDragItem | null =
      canDrag && meta.projectItemId && meta.projectItem
        ? {
            itemId: meta.projectItemId,
            parentId: meta.parentId || meta.projectId,
            isRoot: Boolean(meta.isRoot),
            path: meta.path,
            children: meta.projectItem.children,
            parentChildren: meta.parentChildren,
          }
        : null;

    const [{ isDragging }, drag] = useDrag(
      () => ({
        type: sidebarDragType,
        item: dragItem,
        canDrag: () => Boolean(dragItem),
        collect: monitor => ({
          isDragging: monitor.isDragging(),
        }),
      }),
      [dragItem]
    );

    if (!isProject) {
      drag(nodeRef);
    }

    useEffect(() => {
      if (!editing) return;
      const finishEditing = () => {
        const nextTitle = titleRef.current?.getValue().trim();
        setEditing(false);
        titleRef.current?.setContentEditable(false);
        if (nextTitle) onRename(meta, nextTitle);
      };
      window.addEventListener("mindmap:canvas-pointer-down", finishEditing);
      return () => {
        window.removeEventListener("mindmap:canvas-pointer-down", finishEditing);
      };
    }, [editing, meta, onRename]);

    const content = (
      <div
        ref={nodeRef}
        data-project-mindmap-root={isProject ? "true" : undefined}
        data-project-mindmap-node-id={meta.nodeId}
        data-project-mindmap-item-id={meta.projectItemId}
        className={classnames(
          "relative -m-3 flex items-center gap-2 whitespace-nowrap px-4 py-3 outline-offset-4",
          isDragging && "opacity-50",
          activeDropPlacement?.indicator === "inside" &&
            activeDropPlacement.referenceNodeId === meta.nodeId &&
            "rounded outline outline-2 outline-[var(--th-active-text)]"
        )}
        onContextMenu={event => {
          if (!isProject) {
            event.stopPropagation();
          }
        }}
      >
        <span className="flex h-5 w-5 flex-none items-center justify-center text-[16px]">
          {isProject ? (
            <FolderOpen />
          ) : (
            getItemIcon(
              meta.projectItem?.projectItemType,
              Boolean(meta.projectItem?.children.length)
            )
          )}
        </span>
        {isProject ? (
          <div className="whitespace-nowrap text-sm font-semibold leading-6">{meta.title}</div>
        ) : (
          <div
            onDoubleClick={event => {
              event.stopPropagation();
              startEditing();
            }}
          >
            <EditText
              key={`${meta.projectItemId}-${meta.title}`}
              ref={titleRef}
              defaultValue={meta.title}
              contentEditable={editing}
              className="whitespace-nowrap text-sm font-medium leading-6 outline-none"
              onPressEnter={() => {
                const nextTitle = titleRef.current?.getValue().trim();
                setEditing(false);
                titleRef.current?.setContentEditable(false);
                if (nextTitle) onRename(meta, nextTitle);
              }}
              onBlur={() => {
                if (!editing) return;
                const nextTitle = titleRef.current?.getValue().trim();
                setEditing(false);
                titleRef.current?.setContentEditable(false);
                if (nextTitle) onRename(meta, nextTitle);
              }}
            />
          </div>
        )}
      </div>
    );

    if (isProject) return content;

    return (
      <ProjectMindMapItemActions
        content={content}
        meta={meta}
        activeItemId={activeItemId}
        reloadTree={reloadTree}
        refreshProject={refreshProject}
        startEditing={startEditing}
      />
    );
  }
);

MindMapNodeContent.displayName = "MindMapNodeContent";

const ProjectMindMapNodeActions = memo(
  ({
    node,
    context,
    addMenuItems,
    onAddMenuClick,
  }: {
    node: MindMapNodeData;
    context: MindMapNodeActionContext;
    addMenuItems: MenuProps["items"];
    onAddMenuClick: ProjectMindMapViewProps["onAddMenuClick"];
  }) => {
    const meta = node.meta as ProjectMindMapNodeMeta;
    const isProject = meta.nodeKind === "project";
    const [open, setOpen] = useState(false);
    const sideClass =
      context.actionSide === "left"
        ? context.hasFoldIndicator
          ? "-left-9"
          : "-left-4"
        : context.hasFoldIndicator
          ? "-right-11"
          : "-right-6";

    useEffect(() => {
      if (!open) return;
      const closeMenu = () => setOpen(false);
      window.addEventListener("mindmap:canvas-pointer-down", closeMenu);
      return () => {
        window.removeEventListener("mindmap:canvas-pointer-down", closeMenu);
      };
    }, [open]);

    return (
      <Dropdown
        open={open}
        onOpenChange={setOpen}
        menu={{
          items: addMenuItems,
          onClick: info => {
            setOpen(false);
            onAddMenuClick(info, isProject ? undefined : meta.projectItemId);
          },
        }}
        trigger={["click"]}
      >
        <Tooltip content={isProject ? "添加根节点" : "添加子节点"}>
          <button
            data-mindmap-interactive
            className={classnames(
              "absolute top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-[11px] text-black/65 opacity-0 transition-opacity hover:bg-gray-200 hover:text-black/90 group-hover/mindmap-node:opacity-100 dark:bg-zinc-700 dark:text-white/70 dark:hover:bg-zinc-600 dark:hover:text-white",
              open && "opacity-100",
              sideClass
            )}
            onClick={event => event.stopPropagation()}
          >
            <Plus />
          </button>
        </Tooltip>
      </Dropdown>
    );
  }
);

ProjectMindMapNodeActions.displayName = "ProjectMindMapNodeActions";

const ProjectMindMapView = (props: ProjectMindMapViewProps) => {
  const {
    project,
    treeData,
    activeItemId,
    databaseName,
    cards,
    whiteBoards,
    pdfs,
    epubs,
    addMenuItems,
    onAddMenuClick,
    refreshProject,
    reloadTree,
    initialPan,
    initialZoom,
    onViewportChange,
  } = props;
  void cards;
  void whiteBoards;
  void pdfs;
  void epubs;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dropPlacement, setDropPlacement] = useState<MindMapDropPlacement | null>(null);
  const [foldStateVersion, setFoldStateVersion] = useState(0);
  const navigateTo = useTabStore(state => state.navigateTo);
  const mindMapData = useMemo(
    () =>
      buildProjectMindMapData(project, treeData, (itemId, path) => {
        const raw = window.localStorage.getItem(`project-item-${databaseName}-${itemId}`);
        if (raw === null) {
          return path.length === 1;
        }
        try {
          return Boolean(JSON.parse(raw));
        } catch {
          return path.length === 1;
        }
      }),
    [databaseName, foldStateVersion, project, treeData]
  );
  const projectItemEventBus = useMemo(() => defaultProjectItemEventBus.createEditor(), []);
  const { moveProjectItem } = useProjectTreeOperations({
    projectId: project.id,
    treeData,
    refreshProject,
  });
  const [, drop] = useDrop<IDragItem>(
    () => ({
      accept: sidebarDragType,
      hover: (item, monitor) => {
        const nextPlacement = getMindMapDropPlacement({
          clientOffset: monitor.getClientOffset(),
          container: containerRef.current,
          treeData,
          rootId: project.id,
          nodeSelector: PROJECT_NODE_SELECTOR,
          rootSelector: PROJECT_ROOT_SELECTOR,
          dragItem: item,
        });
        setDropPlacement(
          isDropPlacementAllowed(nextPlacement, item, treeData) ? nextPlacement : null
        );
      },
      canDrop: (item, monitor) => {
        const placement = getMindMapDropPlacement({
          clientOffset: monitor.getClientOffset(),
          container: containerRef.current,
          treeData,
          rootId: project.id,
          nodeSelector: PROJECT_NODE_SELECTOR,
          rootSelector: PROJECT_ROOT_SELECTOR,
          dragItem: item,
        });
        return isDropPlacementAllowed(placement, item, treeData);
      },
      drop: (item, monitor) => {
        if (monitor.didDrop()) return;
        const placement =
          dropPlacement ||
          getMindMapDropPlacement({
            clientOffset: monitor.getClientOffset(),
            container: containerRef.current,
            treeData,
            rootId: project.id,
            nodeSelector: PROJECT_NODE_SELECTOR,
            rootSelector: PROJECT_ROOT_SELECTOR,
            dragItem: item,
          });
        if (!placement || !isDropPlacementAllowed(placement, item, treeData)) {
          setDropPlacement(null);
          return;
        }
        const dropTargetId =
          placement.referenceNodeId && treeData.nodeMap.get(placement.referenceNodeId)?.item.id;
        void (async () => {
          await moveProjectItem({
            dragItem: item,
            dropTargetId: dropTargetId || item.itemId,
            dropTargetParentId: placement.parentId,
            dropTargetIsRoot: placement.parentIsRoot,
            dragPosition: EDragPosition.Top,
            insertParentId: placement.parentId,
            insertParentIsRoot: placement.parentIsRoot,
            insertIndex: placement.insertIndex,
          });
          await reloadTree({ silent: true });
          setDropPlacement(null);
        })();
      },
    }),
    [dropPlacement, moveProjectItem, project.id, reloadTree, treeData]
  );

  drop(containerRef);

  const selectedNodeIds = activeItemId
    ? (treeData.itemNodeMap.get(activeItemId) || []).map(node => getProjectMindMapNodeId(node))
    : [getProjectMindMapRootId(project.id)];
  const dropGuide = useMemo(
    () =>
      buildMindMapDropGuide({
        placement: dropPlacement,
        container: containerRef.current,
        nodeSelector: PROJECT_NODE_SELECTOR,
        rootSelector: PROJECT_ROOT_SELECTOR,
      }),
    [dropPlacement]
  );

  const handleRename = async (meta: ProjectMindMapNodeMeta, title: string) => {
    if (!meta.projectItem || title === meta.projectItem.title) return;
    const updated = await updateProjectItem({
      ...meta.projectItem,
      title,
    });
    if (!updated) return;
    projectItemEventBus.publishProjectItemEvent("project-item:updated", updated);
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 overflow-hidden rounded-md border border-transparent"
    >
      <MindMap
        data={mindMapData}
        cacheNamespace={`project-${project.id}`}
        selectedNodeIds={selectedNodeIds}
        interactionMode="editable"
        initialPan={initialPan}
        initialZoom={initialZoom}
        onViewportChange={onViewportChange}
        onNodeFoldChange={(nodeId, _direction, folded) => {
          const projectItemId = parseProjectMindMapItemId(nodeId);
          if (!projectItemId) return;
          window.localStorage.setItem(
            `project-item-${databaseName}-${projectItemId}`,
            JSON.stringify(!folded)
          );
          setFoldStateVersion(version => version + 1);
        }}
        className="group"
        onNodeClick={nodeId => {
          const projectItemId = parseProjectMindMapItemId(nodeId);
          if (!projectItemId) {
            navigateTo(TabType.ProjectDetail, { id: project.id });
            return;
          }
          const item = treeData.itemMap.get(projectItemId);
          navigateTo(
            TabType.ProjectDetail,
            { id: project.id, itemId: projectItemId },
            `项目 - ${item?.title || `#${projectItemId}`}`
          );
        }}
        renderNodeContent={node => (
          <MindMapNodeContent
            node={node}
            onRename={handleRename}
            reloadTree={reloadTree}
            activeItemId={activeItemId}
            refreshProject={refreshProject}
            activeDropPlacement={dropPlacement}
          />
        )}
        renderNodeActions={(node, context) => (
          <ProjectMindMapNodeActions
            node={node}
            context={context}
            addMenuItems={addMenuItems}
            onAddMenuClick={onAddMenuClick}
          />
        )}
      />
      {dropGuide && (
        <svg
          className="pointer-events-none absolute left-0 top-0 z-20"
          width={dropGuide.width}
          height={dropGuide.height}
        >
          <path
            d={dropGuide.d}
            stroke="var(--th-active-text)"
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      )}
    </div>
  );
};

export default ProjectMindMapView;
