/**
 * 目录「资料」组：拖拽排序、处理状态、重新处理 / 索引、重命名、删除。
 * 点行交给页面决定打开方式（阅读区或系统默认程序）。
 */

import { useEffect, useRef, useState } from "react";
import { FolderOpen, Pencil, Plus, RotateCw, Trash2 } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { useDrag, useDrop } from "react-dnd";
import { ConfirmDialog, IconButton, Menu, Tooltip, cn, toast } from "@tau/ui";

import type { VLResource, VLResourceStatus } from "@/types/vibe-learning";
import { useResourcesStatus, statusConfig } from "@/hooks/useVibeLearningStatus";
import {
  updateVLResource,
  deleteVLResourceComplete,
  addVLIndexTask,
  reorderVLResources,
} from "@/commands/vibe-learning";
import EditTitleModal, { type EditTitleResult } from "@/components/EditTitleModal";
import { TreeGroupHeader, TreeRow } from "./TreeRow";
import { isDocument, openResourceExternally, resourceIcon } from "../resourceKinds";

type DropPlace = "before" | "after";
type DragItem = { id: number };

const sameOrder = (a: number[], b: number[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

function moveInOrder(list: VLResource[], dragId: number, hoverId: number, place: DropPlace) {
  const from = list.findIndex(r => r.id === dragId);
  const to = list.findIndex(r => r.id === hoverId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  const insert = place === "before" ? to : to + 1;
  next.splice(insert > from ? insert - 1 : insert, 0, moved);
  return sameOrder(
    next.map(r => r.id),
    list.map(r => r.id)
  )
    ? list
    : next;
}

const splitName = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return { base: fileName, ext: "" };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
};

/** 状态标记：完成不标；处理中 accent + 进度，失败 danger，待处理 / 需重建等 warn */
function StatusFlag({ status, percent }: { status: VLResourceStatus; percent: number | null }) {
  if (status === "completed") return null;
  const config = statusConfig[status];
  if (config.spin)
    return (
      <span className="text-accent-text">
        {config.text}
        {percent !== null && ` ${percent}%`}
      </span>
    );
  if (status === "failed") return <span className="text-danger">失败</span>;
  if (status === "pending") return <span className="text-ink-3">{config.text}</span>;
  return <span className="text-warn">{config.text}</span>;
}

interface ResourceRowProps {
  resource: VLResource;
  status: VLResourceStatus;
  percent: number | null;
  active: boolean;
  onMove: (dragId: number, hoverId: number, place: DropPlace) => void;
  onCommitOrder: () => void;
  onCancelOrder: () => void;
  onOpen: (resource: VLResource) => void;
  onReprocess: (resource: VLResource, indexOnly: boolean) => void;
  onRename: (resource: VLResource) => void;
  onDelete: (resource: VLResource) => void;
}

function ResourceRow(props: ResourceRowProps) {
  const { resource, status, percent, active, onMove, onCommitOrder, onCancelOrder } = props;
  const rowRef = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: "VL_RESOURCE",
      item: { id: resource.id } as DragItem,
      end: (_item, monitor) => (monitor.didDrop() ? onCommitOrder() : onCancelOrder()),
      collect: monitor => ({ isDragging: monitor.isDragging() }),
    }),
    [resource.id, onCancelOrder, onCommitOrder]
  );
  const [, drop] = useDrop<DragItem, { dropped: true }, unknown>({
    accept: "VL_RESOURCE",
    hover: (item, monitor) => {
      if (item.id === resource.id || !rowRef.current) return;
      const rect = rowRef.current.getBoundingClientRect();
      const offset = monitor.getClientOffset();
      if (!offset) return;
      onMove(item.id, resource.id, offset.y - rect.top < rect.height / 2 ? "before" : "after");
    },
    drop: () => ({ dropped: true }),
  });
  drag(drop(rowRef));

  const Icon = resourceIcon(resource);
  const busy = statusConfig[status].spin;

  return (
    <TreeRow
      ref={rowRef}
      icon={<Icon className="size-[15px]" strokeWidth={1.75} />}
      title={resource.name}
      active={active}
      className={cn(isDragging && "opacity-40")}
      flag={<StatusFlag status={status} percent={percent} />}
      onClick={() => props.onOpen(resource)}
      menu={
        <>
          {!busy && (
            <Menu.Item
              icon={<RotateCw className="size-4" strokeWidth={1.75} />}
              onSelect={() => props.onReprocess(resource, status === "completed")}
            >
              {status === "completed" ? "重新索引" : "重新处理"}
            </Menu.Item>
          )}
          {isDocument(resource) && (
            <Menu.Item
              icon={<FolderOpen className="size-4" strokeWidth={1.75} />}
              onSelect={() => void openResourceExternally(resource)}
            >
              用默认程序打开
            </Menu.Item>
          )}
          <Menu.Item
            icon={<Pencil className="size-4" strokeWidth={1.75} />}
            onSelect={() => props.onRename(resource)}
          >
            重命名
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item
            danger
            icon={<Trash2 className="size-4" strokeWidth={1.75} />}
            onSelect={() => props.onDelete(resource)}
          >
            删除
          </Menu.Item>
        </>
      }
    />
  );
}

interface ResourceGroupProps {
  projectId: number;
  mainDbName: string;
  resources: VLResource[];
  activeResourceId: number | null;
  onOpen: (resource: VLResource) => void;
  onAdd: () => void;
  onResourcesChange: () => void | Promise<void>;
  /** 资源被删除（阅读区若正打开它要关掉） */
  onDeleted: (resourceId: number) => void;
}

export function ResourceGroup(props: ResourceGroupProps) {
  const { projectId, mainDbName, resources, activeResourceId, onResourcesChange } = props;
  const [open, setOpen] = useState(true);
  const [ordered, setOrdered] = useState(resources);
  const [renaming, setRenaming] = useState<VLResource | null>(null);
  const [deleting, setDeleting] = useState<VLResource | null>(null);

  const sourceRef = useRef(resources);
  const orderedRef = useRef(resources);
  const persistedRef = useRef(resources.map(r => r.id));
  const pendingRef = useRef<number[] | null>(null);
  const persistingRef = useRef(false);

  useEffect(() => {
    sourceRef.current = resources;
    orderedRef.current = resources;
    persistedRef.current = resources.map(r => r.id);
    setOrdered(resources);
  }, [resources]);

  const {
    getStatus,
    getProgress,
    refresh: refreshStatus,
  } = useResourcesStatus(resources, mainDbName, {
    projectId,
    onResourceUpdate: onResourcesChange,
  });

  const percentOf = (id: number) => {
    const p = getProgress(id);
    if (!p || p.total <= 0) return null;
    return Math.max(0, Math.min(100, Math.floor(((p.completed + p.failed) / p.total) * 100)));
  };

  const handleReprocess = useMemoizedFn(async (resource: VLResource, indexOnly: boolean) => {
    const status = getStatus(resource.id);
    try {
      const result = await addVLIndexTask({
        resourceId: resource.id,
        projectId,
        mainDbName,
        originalPath: resource.originalPath,
        resourceName: resource.name,
        markdownPath: resource.markdownPath || undefined,
        type: indexOnly || status === "need_index" ? "index_only" : "full",
      });
      if (!result.accepted && result.reason === "already_running") {
        toast.info("该资源正在处理中");
        return;
      }
      toast.success(indexOnly ? "已添加到索引队列" : "已添加到处理队列");
      refreshStatus();
    } catch (error) {
      console.error("Reprocess failed:", error);
      toast.error("添加处理任务失败");
    }
  });

  const handleDelete = useMemoizedFn(async (resource: VLResource) => {
    try {
      await deleteVLResourceComplete({
        resourceId: resource.id,
        projectId,
        mainDbName,
        markdownPath: resource.markdownPath || undefined,
      });
      toast.success("已删除");
      props.onDeleted(resource.id);
      onResourcesChange();
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("删除失败");
    }
  });

  const handleRename = useMemoizedFn(async (result: EditTitleResult) => {
    const target = renaming;
    setRenaming(null);
    if (!target) return;
    const base = result.title.trim();
    if (!base) {
      toast.warning("资源名称不能为空");
      return;
    }
    const name = base + splitName(target.name).ext;
    if (name === target.name) return;
    try {
      await updateVLResource({ id: target.id, name });
      onResourcesChange();
    } catch (error) {
      console.error("Rename failed:", error);
      toast.error("重命名失败");
    }
  });

  const flushOrder = useMemoizedFn(async () => {
    if (persistingRef.current || !pendingRef.current) return;
    const next = pendingRef.current;
    pendingRef.current = null;
    if (sameOrder(next, persistedRef.current)) return;
    persistingRef.current = true;
    try {
      await reorderVLResources(projectId, next);
      persistedRef.current = next;
      await Promise.resolve(onResourcesChange());
    } catch (error) {
      console.error("Failed to reorder resources:", error);
      orderedRef.current = sourceRef.current;
      setOrdered(sourceRef.current);
      toast.error("保存资源顺序失败");
    } finally {
      persistingRef.current = false;
      if (pendingRef.current) void flushOrder();
    }
  });

  const handleMove = useMemoizedFn((dragId: number, hoverId: number, place: DropPlace) => {
    const next = moveInOrder(orderedRef.current, dragId, hoverId, place);
    if (next === orderedRef.current) return;
    orderedRef.current = next;
    setOrdered(next);
  });

  const handleCommitOrder = useMemoizedFn(() => {
    const next = orderedRef.current.map(r => r.id);
    if (sameOrder(next, persistedRef.current)) return;
    pendingRef.current = next;
    void flushOrder();
  });

  const handleCancelOrder = useMemoizedFn(() => {
    orderedRef.current = sourceRef.current;
    setOrdered(sourceRef.current);
  });

  return (
    <section>
      <TreeGroupHeader
        title="资料"
        count={ordered.length}
        open={open}
        onToggle={() => setOpen(v => !v)}
        action={
          <Tooltip content="添加资料" placement="bottom">
            <IconButton className="size-[24px]" aria-label="添加资料" onClick={props.onAdd}>
              <Plus className="size-[15px]" strokeWidth={1.75} />
            </IconButton>
          </Tooltip>
        }
      />
      {open &&
        (ordered.length === 0 ? (
          <div className="text-tau-sm text-ink-3 px-3 pb-3 pt-1 leading-relaxed">
            PDF、Office、音视频、网页，B 站 / YouTube 链接，或卡片库里已有的笔记。
            <button
              type="button"
              onClick={props.onAdd}
              className="text-accent-text ml-1 hover:underline"
            >
              添加资料
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-px">
            {ordered.map(resource => (
              <ResourceRow
                key={resource.id}
                resource={resource}
                status={getStatus(resource.id)}
                percent={percentOf(resource.id)}
                active={resource.id === activeResourceId}
                onMove={handleMove}
                onCommitOrder={handleCommitOrder}
                onCancelOrder={handleCancelOrder}
                onOpen={props.onOpen}
                onReprocess={handleReprocess}
                onRename={setRenaming}
                onDelete={setDeleting}
              />
            ))}
          </div>
        ))}

      <EditTitleModal
        open={renaming !== null}
        onCancel={() => setRenaming(null)}
        onConfirm={handleRename}
        initialTitle={renaming ? splitName(renaming.name).base : ""}
        modalTitle="重命名资源"
        modalDescription={
          renaming
            ? `扩展名 ${splitName(renaming.name).ext || "无"} 会自动保留`
            : "输入新的资源名称"
        }
        placeholder="资源名称"
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={next => !next && setDeleting(null)}
        title="删除资源"
        context={deleting?.name}
        description="确定删除此资源吗？转换出的文本与索引会一并删除。"
        danger
        confirmText="删除"
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) void handleDelete(target);
        }}
      />
    </section>
  );
}
