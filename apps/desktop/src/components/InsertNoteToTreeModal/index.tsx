import { memo, useState, useEffect, useCallback } from "react";
import { Descendant } from "slate";
import { ChevronRight, FileText, Folder, FolderInput } from "lucide-react";
import { Button, Dialog, Loading, cn, toast, useEdgeFade } from "@tau/ui";
import { getProjectList } from "@/commands/project";
import {
  addRootProjectItem,
  addChildProjectItem,
  createSharedProjectItemFromContent,
} from "@/commands/project";
import { createWebLink } from "@/commands/web-link";
import { getContentById } from "@/commands";
import { createEmptyVideoNote } from "@/commands/video-notes";
import { getContentLength } from "@/utils";
import { EProjectType, EProjectItemType } from "@/types/project";
import type { CreateProjectItem, Project, ProjectItem } from "@/types/project";
import type { VideoNote } from "@/types/video-note";
import type { WebLinkSourceType } from "@/types/web-link";
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
  insertMode?: "copy" | "shared-content" | "webview" | "video-note";
  webviewPayload?: {
    title: string;
    url: string;
    sourceType?: WebLinkSourceType;
  };
  videoNotePayload?: {
    title: string;
    metaInfo?: VideoNote["metaInfo"];
    resolveMetaInfo?: () => Promise<VideoNote["metaInfo"]>;
  };
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
    webviewPayload,
    videoNotePayload,
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
          setProjects(
            allProjects.filter(p => p.projectType === EProjectType.DocumentTree && !p.archived)
          );
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
        if (insertMode === "webview") {
          if (mode !== "project" || !webviewPayload?.url) {
            throw new Error("缺少网页信息");
          }

          const title = webviewPayload.title.trim() || webviewPayload.url;
          const webLink = await createWebLink({
            title,
            url: webviewPayload.url,
            sourceType: webviewPayload.sourceType || "remote",
          });

          const newItem: CreateProjectItem = {
            title: webLink.title,
            content: [],
            children: [],
            refType: "web-link",
            refId: webLink.id,
            projectItemType: EProjectItemType.WebView,
            count: 0,
            whiteBoardContentId: 0,
          };

          let createdItem: ProjectItem | null = null;
          if (selectedNodeId) {
            [, createdItem] = await addChildProjectItem(selectedNodeId, newItem);
          } else {
            [, createdItem] = await addRootProjectItem(selectedEntityId, newItem);
          }
          toast.success("网页已添加到项目");
          onSuccess(createdItem);
          return;
        } else if (insertMode === "video-note") {
          if (mode !== "project" || !videoNotePayload) {
            throw new Error("缺少视频信息");
          }

          const metaInfo =
            videoNotePayload.metaInfo || (await videoNotePayload.resolveMetaInfo?.());
          if (!metaInfo) {
            throw new Error("缺少视频信息");
          }

          const videoNote = await createEmptyVideoNote(metaInfo);
          if (!videoNote) {
            throw new Error("创建视频笔记失败");
          }

          const newItem: CreateProjectItem = {
            title: videoNotePayload.title.trim() || "视频笔记",
            content: [],
            children: [],
            refType: "video-note",
            refId: videoNote.id,
            projectItemType: EProjectItemType.VideoNote,
            count: 0,
            whiteBoardContentId: 0,
          };

          let createdItem: ProjectItem | null = null;
          if (selectedNodeId) {
            [, createdItem] = await addChildProjectItem(selectedNodeId, newItem);
          } else {
            [, createdItem] = await addRootProjectItem(selectedEntityId, newItem);
          }
          toast.success("视频笔记已添加到项目");
          onSuccess(createdItem);
          return;
        } else if (insertMode === "shared-content") {
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
          if (selectedNodeId) {
            await addChildProjectItem(selectedNodeId, newItem);
          } else {
            await addRootProjectItem(selectedEntityId, newItem);
          }
          toast.success("笔记已插入");
        }
        onSuccess();
      } catch (error) {
        console.error("Failed to insert note:", error);
        toast.error(
          insertMode === "webview"
            ? "添加网页失败"
            : insertMode === "video-note"
              ? "添加视频笔记失败"
              : insertMode === "shared-content"
                ? "挂载内容失败"
                : "插入笔记失败"
        );
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
      webviewPayload,
      videoNotePayload,
      onSuccess,
    ]);

    const actionText =
      insertMode === "shared-content"
        ? "创建"
        : insertMode === "webview" || insertMode === "video-note"
          ? "添加"
          : "插入";

    const isAddMode = insertMode === "webview" || insertMode === "video-note";

    return (
      <Dialog
        open={open}
        onOpenChange={next => {
          if (!next) onCancel();
        }}
        width={680}
        locked={inserting}
        icon={<FolderInput className="size-4" strokeWidth={1.75} />}
        title={
          insertMode === "webview"
            ? "添加网页到项目"
            : insertMode === "video-note"
              ? "添加视频笔记到项目"
              : insertMode === "shared-content"
                ? "创建项目文档"
                : "插入笔记到项目"
        }
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
            <span className="text-ink-2 text-[12px]">{isAddMode ? "添加位置" : "插入位置"}</span>
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
                      {isAddMode ? "添加到根目录" : "插入到根目录"}
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
      </Dialog>
    );
  }
);

InsertNoteToTreeModal.displayName = "InsertNoteToTreeModal";

export default InsertNoteToTreeModal;
