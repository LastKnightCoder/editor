import { memo, useState, useEffect, useCallback } from "react";
import { Descendant } from "slate";
import { ChevronRight, FileText, Folder, FolderInput } from "lucide-react";
import { Button, Dialog, DialogBody, Loading, cn, toast, useEdgeFade } from "@tau/ui";
import { getProjectList } from "@/commands/project";
import {
  addRootProjectItem,
  addChildProjectItem,
  createSharedProjectItemFromContent,
} from "@/commands/project";
import { getContentById } from "@/commands";
import { recordLineage } from "@/commands/lineage";
import type { LineageNode } from "@/entity/lineage";
import { getContentLength } from "@/utils";
import { EProjectItemType } from "@/types/project";
import type { CreateProjectItem, Project, ProjectItem } from "@/types/project";
import { buildProjectTree } from "@/components/PublishSelector/utils/treeBuilder";

interface DocTreeNode {
  id: number;
  title: string;
  hasContent: boolean;
  content: Descendant[];
  children: DocTreeNode[];
}

interface InsertNoteToTreeModalProps {
  mode: "project";
  open: boolean;
  noteTitle: string;
  noteContent: Descendant[];
  sourceContentId?: number | null;
  /** copy：复制一份正文成新文档；shared-content：与来源共用正文（投影） */
  insertMode?: "copy" | "shared-content";
  /** copy 时的来源实体：复制出的文档记谱系 derived */
  source?: LineageNode;
  onCancel: () => void;
  onSuccess: (createdItem?: ProjectItem | null) => void;
}

/** 行基础样式：30px 行高、7px 圆角；层级靠缩进，不画连接线 */
const rowClass = (active: boolean) =>
  cn(
    "text-tau-meta flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[7px] pr-2 outline-none",
    "focus-visible:shadow-[var(--tau-focus-ring)]",
    active ? "bg-selected text-ink-1" : "text-ink-2 hover:bg-hover hover:text-ink-1"
  );

// 递归树节点组件
const TreeNodeItem = memo<{
  node: DocTreeNode;
  selectedNodeId: number | null;
  onSelect: (id: number) => void;
  depth?: number;
}>(({ node, selectedNodeId, onSelect, depth = 0 }) => {
  const [expanded, setExpanded] = useState(true);
  const isSelected = selectedNodeId === node.id;
  const hasChildren = node.children.length > 0;
  const Icon = hasChildren ? Folder : FileText;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        title={node.title}
        className={rowClass(isSelected)}
        style={{ paddingLeft: depth * 16 + 4 }}
        onClick={() => onSelect(node.id)}
        onKeyDown={e => {
          if (e.key === "Enter" && e.target === e.currentTarget) onSelect(node.id);
        }}
      >
        {hasChildren ? (
          <span
            role="button"
            aria-label={expanded ? "折叠" : "展开"}
            aria-expanded={expanded}
            className="text-ink-3 hover:text-ink-1 grid size-4 shrink-0 place-items-center"
            onClick={e => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <ChevronRight
              className={cn(
                "ease-tau-out size-3.5 transition-transform duration-150",
                expanded && "rotate-90"
              )}
              strokeWidth={1.75}
            />
          </span>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <Icon
          className={cn("size-[14px] shrink-0", isSelected ? "text-ink-2" : "text-ink-3")}
          strokeWidth={1.75}
        />
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
      </div>
      {expanded &&
        node.children.map(child => (
          <TreeNodeItem
            key={child.id}
            node={child}
            selectedNodeId={selectedNodeId}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </div>
  );
});

TreeNodeItem.displayName = "TreeNodeItem";

const InsertNoteToTreeModal = memo<InsertNoteToTreeModalProps>(
  ({
    mode,
    open,
    noteTitle,
    noteContent,
    sourceContentId = null,
    insertMode = "copy",
    source,
    onCancel,
    onSuccess,
  }) => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
    const [treeNodes, setTreeNodes] = useState<DocTreeNode[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [treeLoading, setTreeLoading] = useState(false);
    const [inserting, setInserting] = useState(false);
    const [entityListEl, setEntityListEl] = useState<HTMLDivElement | null>(null);
    const [treeEl, setTreeEl] = useState<HTMLDivElement | null>(null);
    useEdgeFade(entityListEl);
    useEdgeFade(treeEl);

    // 加载项目列表
    useEffect(() => {
      if (!open) return;
      setLoading(true);

      getProjectList()
        .then(allProjects => {
          // 项目即文档树（数据库 / Vibe Learning 已拆为独立模块），只需过掉归档
          setProjects(allProjects.filter(p => !p.archived));
        })
        .catch(() => toast.error("加载列表失败"))
        .finally(() => setLoading(false));
    }, [open, mode]);

    // 关闭时重置状态
    useEffect(() => {
      if (!open) {
        setSelectedEntityId(null);
        setTreeNodes([]);
        setSelectedNodeId(null);
      }
    }, [open]);

    // 当前 mode 对应的列表
    const entityList = projects;

    // 选择项目，加载文档树
    const handleSelectEntity = useCallback(
      async (entity: Project) => {
        setSelectedEntityId(entity.id);
        setSelectedNodeId(null);
        setTreeLoading(true);
        try {
          const nodes = await buildProjectTree(entity as Project);
          setTreeNodes(nodes);
        } catch {
          setTreeNodes([]);
        } finally {
          setTreeLoading(false);
        }
      },
      [mode]
    );

    // 确认插入
    const handleConfirm = useCallback(async () => {
      if (!selectedEntityId) return;
      setInserting(true);
      try {
        if (insertMode === "shared-content") {
          if (!sourceContentId) {
            throw new Error("缺少共享内容 ID");
          }

          const title = noteTitle || `答案 #${sourceContentId}`;

          await createSharedProjectItemFromContent({
            sourceContentId,
            projectId: selectedEntityId,
            parentProjectItemId: selectedNodeId,
            title,
          });
          toast.success("内容已挂载");
        } else {
          let contentToInsert = noteContent;
          if (sourceContentId) {
            const contentData = await getContentById(sourceContentId);
            if (contentData) {
              contentToInsert = contentData.content;
            }
          }
          const count = getContentLength(contentToInsert);

          const newItem: CreateProjectItem = {
            title: noteTitle || "VL 笔记",
            content: contentToInsert,
            children: [],
            refType: "",
            refId: 0,
            projectItemType: EProjectItemType.Document,
            count,
            whiteBoardContentId: 0,
          };
          const [, createdItem] = selectedNodeId
            ? await addChildProjectItem(selectedNodeId, newItem)
            : await addRootProjectItem(selectedEntityId, newItem);
          if (source && createdItem) {
            await recordLineage({
              src: source,
              dst: { kind: "project-item", id: createdItem.id },
              relation: "derived",
            });
          }
          toast.success("笔记已插入");
        }
        onSuccess();
      } catch (error) {
        console.error("Failed to insert note:", error);
        toast.error(insertMode === "shared-content" ? "挂载内容失败" : "插入笔记失败");
      } finally {
        setInserting(false);
      }
    }, [
      selectedEntityId,
      mode,
      selectedNodeId,
      noteTitle,
      noteContent,
      sourceContentId,
      insertMode,
      source,
      onSuccess,
    ]);

    const actionText = insertMode === "shared-content" ? "创建" : "插入";

    return (
      <Dialog
        open={open}
        onOpenChange={next => {
          if (!next) onCancel();
        }}
        width={680}
        locked={inserting}
        icon={<FolderInput className="size-4" strokeWidth={1.75} />}
        title={insertMode === "shared-content" ? "创建项目文档" : "插入笔记到项目"}
        footer={
          <>
            <Button variant="secondary" size="sm" disabled={inserting} onClick={onCancel}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={inserting}
              disabled={!selectedEntityId}
              onClick={handleConfirm}
            >
              {actionText}
            </Button>
          </>
        }
      >
        <DialogBody>
          {/* 左右布局：左侧项目，右侧插入位置 */}
          <div className="flex h-[400px] gap-3">
            {/* 左侧：项目列表 */}
            <div className="border-line-2 flex w-56 shrink-0 flex-col gap-1.5 border-r pr-3">
              <span className="text-ink-2 text-[12px]">项目</span>
              <div
                ref={setEntityListEl}
                className="edge-fade-scroll scrollbar-inset min-h-0 flex-1 overflow-y-auto"
              >
                {loading ? (
                  <Loading minHeight={0} />
                ) : entityList.length === 0 ? (
                  <p className="text-tau-sm text-ink-3 py-10 text-center">暂无文档类型项目</p>
                ) : (
                  <div className="flex flex-col gap-px">
                    {entityList.map(entity => {
                      const title = entity.title || `#${entity.id}`;
                      return (
                        <div
                          key={entity.id}
                          role="button"
                          tabIndex={0}
                          title={title}
                          className={cn(rowClass(selectedEntityId === entity.id), "pl-2")}
                          onClick={() => handleSelectEntity(entity)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && e.target === e.currentTarget)
                              handleSelectEntity(entity);
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate">{title}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 右侧：文档树 */}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-ink-2 text-[12px]">插入位置</span>
              <div
                ref={setTreeEl}
                className="edge-fade-scroll scrollbar-inset min-h-0 flex-1 overflow-y-auto"
              >
                {!selectedEntityId ? (
                  <p className="text-tau-sm text-ink-3 py-10 text-center">先在左侧选择一个项目</p>
                ) : treeLoading ? (
                  <Loading minHeight={0} />
                ) : (
                  <div className="flex flex-col gap-px">
                    {/* 根目录选项 */}
                    <div
                      role="button"
                      tabIndex={0}
                      className={rowClass(selectedNodeId === null)}
                      style={{ paddingLeft: 4 }}
                      onClick={() => setSelectedNodeId(null)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && e.target === e.currentTarget)
                          setSelectedNodeId(null);
                      }}
                    >
                      <span className="size-4 shrink-0" />
                      <Folder
                        className={cn(
                          "size-[14px] shrink-0",
                          selectedNodeId === null ? "text-ink-2" : "text-ink-3"
                        )}
                        strokeWidth={1.75}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        插入到根目录
                      </span>
                    </div>
                    {/* 文档树节点 */}
                    {treeNodes.map(node => (
                      <TreeNodeItem
                        key={node.id}
                        node={node}
                        selectedNodeId={selectedNodeId}
                        onSelect={setSelectedNodeId}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogBody>
      </Dialog>
    );
  }
);

InsertNoteToTreeModal.displayName = "InsertNoteToTreeModal";

export default InsertNoteToTreeModal;
