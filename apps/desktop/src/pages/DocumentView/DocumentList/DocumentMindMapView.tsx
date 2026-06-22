import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dropdown, MenuProps, Tooltip } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useDrag, useDrop } from "react-dnd";
import classnames from "classnames";
import EditText, { EditTextHandle } from "@/components/EditText";
import MindMap from "@/components/MindMap";
import type { MindMapNodeActionContext } from "@/components/MindMap";
import { MindMapNodeData } from "@/components/MindMap/types";
import { IDocument } from "@/types";
import { TabType } from "@/types/tab";
import {
  EDragPosition,
  IDragItem,
  type as sidebarDragType,
} from "@/hooks/useDragAndDrop";
import useTabStore from "@/stores/useTabStore";
import { updateDocumentItem } from "@/commands";
import { defaultDocumentItemEventBus } from "@/utils";
import {
  buildMindMapDropGuide,
  getMindMapDropPlacement,
  MindMapDropPlacement,
} from "@/pages/shared/mindMapTreeUtils";
import { DocumentTreeData, canMoveDocumentTreeItem } from "./documentTree";
import { useDocumentTreeOperations } from "./useDocumentTreeOperations";
import {
  DocumentMindMapNodeMeta,
  buildDocumentMindMapData,
  getDocumentMindMapNodeId,
  getDocumentMindMapRootId,
  parseDocumentMindMapItemId,
} from "./documentMindMap";

interface DocumentMindMapViewProps {
  document: IDocument;
  treeData: DocumentTreeData;
  activeItemId?: number;
  databaseName: string;
  addMenuItems: MenuProps["items"];
  moreMenuItems: MenuProps["items"];
  onAddMenuClick: (
    info: Parameters<NonNullable<MenuProps["onClick"]>>[0],
    parentDocumentItemId?: number,
  ) => void;
  onMoreMenuClick: (
    info: Parameters<NonNullable<MenuProps["onClick"]>>[0],
    meta: DocumentMindMapNodeMeta,
  ) => void;
  refreshDocument: () => void;
  reloadTree: (options?: { silent?: boolean }) => void | Promise<void>;
  initialPan?: { x: number; y: number };
  initialZoom?: number;
  onViewportChange?: (viewport: {
    pan: { x: number; y: number };
    zoom: number;
  }) => void;
}

const DOCUMENT_NODE_SELECTOR = "data-document-mindmap-node-id";
const DOCUMENT_ROOT_SELECTOR = "data-document-mindmap-root";

const isDropPlacementAllowed = (
  placement: MindMapDropPlacement | null,
  dragItem: IDragItem,
  treeData: DocumentTreeData,
) => {
  if (!placement) return false;
  if (
    dragItem.parentId === placement.parentId &&
    dragItem.isRoot === placement.parentIsRoot
  ) {
    const currentIndex = dragItem.parentChildren.findIndex(
      (id) => id === dragItem.itemId,
    );
    if (
      currentIndex >= 0 &&
      (placement.insertIndex === currentIndex ||
        placement.insertIndex === currentIndex + 1)
    ) {
      return false;
    }
  }

  const parentChildren = placement.parentIsRoot
    ? treeData.nodes.map((node) => node.item.id)
    : treeData.itemMap.get(placement.parentId)?.children;

  return canMoveDocumentTreeItem({
    treeData,
    dragItem,
    dropTargetId: placement.referenceNodeId
      ? (treeData.nodeMap.get(placement.referenceNodeId)?.item.id ??
        dragItem.itemId)
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

const DocumentMindMapNodeContent = memo(
  ({
    node,
    onRename,
    moreMenuItems,
    onMoreMenuClick,
    activeDropPlacement,
  }: {
    node: MindMapNodeData;
    onRename: (meta: DocumentMindMapNodeMeta, title: string) => void;
    moreMenuItems: MenuProps["items"];
    onMoreMenuClick: DocumentMindMapViewProps["onMoreMenuClick"];
    activeDropPlacement: MindMapDropPlacement | null;
  }) => {
    const meta = node.meta as DocumentMindMapNodeMeta;
    const nodeRef = useRef<HTMLDivElement | null>(null);
    const titleRef = useRef<EditTextHandle>(null);
    const [editing, setEditing] = useState(false);
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const isDocument = meta.nodeKind === "document";
    const canDrag =
      meta.nodeKind === "document-item" && Boolean(meta.documentItemId);
    const dragItem: IDragItem | null =
      canDrag && meta.documentItemId && meta.documentItem
        ? {
            itemId: meta.documentItemId,
            parentId: meta.parentId || meta.documentId,
            isRoot: Boolean(meta.isRoot),
            path: meta.path,
            children: meta.documentItem.children,
            parentChildren: meta.parentChildren,
          }
        : null;
    const startEditing = useCallback(() => {
      setEditing(true);
      requestAnimationFrame(() => {
        titleRef.current?.setContentEditable(true);
        titleRef.current?.focusEnd();
      });
    }, []);

    const [{ isDragging }, drag] = useDrag(
      () => ({
        type: sidebarDragType,
        item: dragItem,
        canDrag: () => Boolean(dragItem),
        collect: (monitor) => ({
          isDragging: monitor.isDragging(),
        }),
      }),
      [dragItem],
    );

    if (!isDocument) {
      drag(nodeRef);
    }

    useEffect(() => {
      if (!moreMenuOpen) return;
      const closeMenu = () => setMoreMenuOpen(false);
      window.addEventListener("mindmap:canvas-pointer-down", closeMenu);
      return () => {
        window.removeEventListener("mindmap:canvas-pointer-down", closeMenu);
      };
    }, [moreMenuOpen]);

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
        window.removeEventListener(
          "mindmap:canvas-pointer-down",
          finishEditing,
        );
      };
    }, [editing, meta, onRename]);

    const content = (
      <div
        ref={nodeRef}
        data-document-mindmap-root={isDocument ? "true" : undefined}
        data-document-mindmap-node-id={meta.nodeId}
        data-document-mindmap-item-id={meta.documentItemId}
        className={classnames(
          "relative -m-3 flex items-center whitespace-nowrap px-4 py-3 outline-offset-4",
          isDragging && "opacity-50",
          activeDropPlacement?.indicator === "inside" &&
            activeDropPlacement.referenceNodeId === meta.nodeId &&
            "rounded outline outline-2 outline-[var(--active-text-color)]",
        )}
        onContextMenu={(event) => {
          if (!isDocument) {
            event.stopPropagation();
          }
        }}
      >
        {isDocument ? (
          <div className="whitespace-nowrap text-sm font-semibold leading-6">
            {meta.title}
          </div>
        ) : (
          <div
            onDoubleClick={(event) => {
              event.stopPropagation();
              startEditing();
            }}
          >
            <EditText
              key={`${meta.documentItemId}-${meta.title}`}
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

    if (
      isDocument ||
      !meta.documentItem ||
      !moreMenuItems ||
      moreMenuItems.length === 0
    ) {
      return content;
    }

    return (
      <Dropdown
        open={moreMenuOpen}
        onOpenChange={setMoreMenuOpen}
        menu={{
          items: moreMenuItems,
          onClick: (info) => {
            info.domEvent.stopPropagation();
            setMoreMenuOpen(false);
            onMoreMenuClick(info, meta);
          },
        }}
        trigger={["contextMenu"]}
      >
        {content}
      </Dropdown>
    );
  },
);

DocumentMindMapNodeContent.displayName = "DocumentMindMapNodeContent";

const DocumentMindMapNodeActions = memo(
  ({
    node,
    context,
    addMenuItems,
    onAddMenuClick,
  }: {
    node: MindMapNodeData;
    context: MindMapNodeActionContext;
    addMenuItems: MenuProps["items"];
    onAddMenuClick: DocumentMindMapViewProps["onAddMenuClick"];
  }) => {
    const meta = node.meta as DocumentMindMapNodeMeta;
    const isDocument = meta.nodeKind === "document";
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
          onClick: (info) => {
            setOpen(false);
            onAddMenuClick(info, isDocument ? undefined : meta.documentItemId);
          },
        }}
        trigger={["click"]}
      >
        <Tooltip title={isDocument ? "添加根文档" : "添加子文档"}>
          <button
            data-mindmap-interactive
            className={classnames(
              "absolute top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-[11px] text-black/65 opacity-0 transition-opacity hover:bg-gray-200 hover:text-black/90 group-hover/mindmap-node:opacity-100 dark:bg-zinc-700 dark:text-white/70 dark:hover:bg-zinc-600 dark:hover:text-white",
              open && "opacity-100",
              sideClass,
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <PlusOutlined />
          </button>
        </Tooltip>
      </Dropdown>
    );
  },
);

DocumentMindMapNodeActions.displayName = "DocumentMindMapNodeActions";

const DocumentMindMapView = (props: DocumentMindMapViewProps) => {
  const {
    document,
    treeData,
    activeItemId,
    databaseName,
    addMenuItems,
    moreMenuItems,
    onAddMenuClick,
    onMoreMenuClick,
    refreshDocument,
    reloadTree,
    initialPan,
    initialZoom,
    onViewportChange,
  } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dropPlacement, setDropPlacement] =
    useState<MindMapDropPlacement | null>(null);
  const [foldStateVersion, setFoldStateVersion] = useState(0);
  const navigateTo = useTabStore((state) => state.navigateTo);
  const mindMapData = useMemo(
    () =>
      buildDocumentMindMapData(document, treeData, (itemId, path) => {
        const raw = window.localStorage.getItem(
          `document-item-${databaseName}-${itemId}`,
        );
        if (raw === null) {
          return path.length === 1;
        }
        try {
          return Boolean(JSON.parse(raw));
        } catch {
          return path.length === 1;
        }
      }),
    [databaseName, document, foldStateVersion, treeData],
  );
  const documentItemEventBus = useMemo(
    () => defaultDocumentItemEventBus.createEditor(),
    [],
  );
  const { moveDocumentItem } = useDocumentTreeOperations({
    documentId: document.id,
    treeData,
    refreshDocument,
  });
  const [, drop] = useDrop<IDragItem>(
    () => ({
      accept: sidebarDragType,
      hover: (item, monitor) => {
        const nextPlacement = getMindMapDropPlacement({
          clientOffset: monitor.getClientOffset(),
          container: containerRef.current,
          treeData,
          rootId: document.id,
          nodeSelector: DOCUMENT_NODE_SELECTOR,
          rootSelector: DOCUMENT_ROOT_SELECTOR,
          dragItem: item,
        });
        setDropPlacement(
          isDropPlacementAllowed(nextPlacement, item, treeData)
            ? nextPlacement
            : null,
        );
      },
      canDrop: (item, monitor) => {
        const placement = getMindMapDropPlacement({
          clientOffset: monitor.getClientOffset(),
          container: containerRef.current,
          treeData,
          rootId: document.id,
          nodeSelector: DOCUMENT_NODE_SELECTOR,
          rootSelector: DOCUMENT_ROOT_SELECTOR,
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
            rootId: document.id,
            nodeSelector: DOCUMENT_NODE_SELECTOR,
            rootSelector: DOCUMENT_ROOT_SELECTOR,
            dragItem: item,
          });
        if (!placement || !isDropPlacementAllowed(placement, item, treeData)) {
          setDropPlacement(null);
          return;
        }
        const dropTargetId =
          placement.referenceNodeId &&
          treeData.nodeMap.get(placement.referenceNodeId)?.item.id;
        void (async () => {
          await moveDocumentItem({
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
    [document.id, dropPlacement, moveDocumentItem, reloadTree, treeData],
  );

  drop(containerRef);

  const selectedNodeIds = activeItemId
    ? (treeData.itemNodeMap.get(activeItemId) || []).map((node) =>
        getDocumentMindMapNodeId(node),
      )
    : [getDocumentMindMapRootId(document.id)];
  const dropGuide = useMemo(
    () =>
      buildMindMapDropGuide({
        placement: dropPlacement,
        container: containerRef.current,
        nodeSelector: DOCUMENT_NODE_SELECTOR,
        rootSelector: DOCUMENT_ROOT_SELECTOR,
      }),
    [dropPlacement],
  );

  const handleRename = async (meta: DocumentMindMapNodeMeta, title: string) => {
    if (!meta.documentItem || title === meta.documentItem.title) return;
    const updated = await updateDocumentItem({
      ...meta.documentItem,
      title,
    });
    if (!updated) return;
    documentItemEventBus.publishDocumentItemEvent(
      "document-item:updated",
      updated,
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 overflow-hidden rounded-md border border-transparent"
    >
      <MindMap
        data={mindMapData}
        cacheNamespace={`document-${document.id}`}
        selectedNodeIds={selectedNodeIds}
        interactionMode="editable"
        initialPan={initialPan}
        initialZoom={initialZoom}
        onViewportChange={onViewportChange}
        onNodeFoldChange={(nodeId, _direction, folded) => {
          const documentItemId = parseDocumentMindMapItemId(nodeId);
          if (!documentItemId) return;
          window.localStorage.setItem(
            `document-item-${databaseName}-${documentItemId}`,
            JSON.stringify(!folded),
          );
          setFoldStateVersion((version) => version + 1);
        }}
        className="group"
        onNodeClick={(nodeId) => {
          const documentItemId = parseDocumentMindMapItemId(nodeId);
          if (!documentItemId) {
            navigateTo(TabType.DocumentDetail, { id: document.id });
            return;
          }
          const item = treeData.itemMap.get(documentItemId);
          navigateTo(
            TabType.DocumentDetail,
            { id: document.id, itemId: documentItemId },
            `知识库 - ${item?.title || `#${documentItemId}`}`,
          );
        }}
        renderNodeContent={(node) => (
          <DocumentMindMapNodeContent
            node={node}
            onRename={handleRename}
            moreMenuItems={moreMenuItems}
            onMoreMenuClick={onMoreMenuClick}
            activeDropPlacement={dropPlacement}
          />
        )}
        renderNodeActions={(node, context) => (
          <DocumentMindMapNodeActions
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
            stroke="var(--active-text-color)"
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      )}
    </div>
  );
};

export default DocumentMindMapView;
