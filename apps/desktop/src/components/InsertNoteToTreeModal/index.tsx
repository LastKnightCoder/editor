import { toast } from "@tau/ui";
import { memo, useState, useEffect, useCallback } from "react";
import { Descendant } from "slate";
import classNames from "classnames";
import {
  FolderOutlined,
  FileOutlined,
  RightOutlined,
  DownOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import useThemeColors from "@/hooks/useThemeColors";
import CustomModal from "@/components/CustomModal";
import LoadingSpinner from "./LoadingSpinner";
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

// 递归树节点组件
const TreeNodeItem = memo<{
  node: DocTreeNode;
  selectedNodeId: number | null;
  onSelect: (id: number) => void;
  depth?: number;
}>(({ node, selectedNodeId, onSelect, depth = 0 }) => {
  const themeColors = useThemeColors();
  const [expanded, setExpanded] = useState(true);
  const isSelected = selectedNodeId === node.id;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={classNames(
          "mx-1 flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 transition-colors",
          isSelected ? "bg-[var(--th-accent-soft)]" : "hover:bg-gray-50 dark:hover:bg-zinc-800/30"
        )}
        style={{ paddingLeft: depth * 12 + 12 }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <span
            className={classNames("flex-shrink-0 text-xs", themeColors.secondaryTextClass)}
            onClick={e => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? <DownOutlined /> : <RightOutlined />}
          </span>
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        {hasChildren ? (
          <FolderOutlined className={classNames("flex-shrink-0", themeColors.secondaryTextClass)} />
        ) : (
          <FileOutlined className={classNames("flex-shrink-0", themeColors.secondaryTextClass)} />
        )}
        <span
          className={classNames(
            "flex-1 truncate text-sm",
            isSelected ? "font-medium text-[var(--th-active-text)]" : themeColors.textClass
          )}
        >
          {node.title}
        </span>
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
    const themeColors = useThemeColors();

    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
    const [treeNodes, setTreeNodes] = useState<DocTreeNode[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [treeLoading, setTreeLoading] = useState(false);
    const [inserting, setInserting] = useState(false);

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

    return (
      <CustomModal
        open={open}
        onCancel={onCancel}
        width={680}
        bodyClassName="!p-0"
        title={
          insertMode === "webview"
            ? "添加网页到项目"
            : insertMode === "video-note"
              ? "添加视频笔记到项目"
              : insertMode === "shared-content"
                ? "创建项目文档"
                : "插入笔记到项目"
        }
        onOk={handleConfirm}
        okText={actionText}
        cancelText="取消"
        confirmLoading={inserting}
        okButtonProps={{ disabled: !selectedEntityId }}
      >
        {/* 左右布局 */}
        <div className="flex" style={{ height: 400 }}>
          {/* 左侧：项目列表 */}
          <div
            className={classNames(
              "w-56 flex-shrink-0 overflow-y-auto border-r",
              themeColors.cardBorderClass
            )}
          >
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <LoadingSpinner size="small" />
              </div>
            ) : entityList.length === 0 ? (
              <div
                className={classNames(
                  "flex h-full items-center justify-center text-sm",
                  themeColors.secondaryTextClass
                )}
              >
                {"暂无文档类型项目"}
              </div>
            ) : (
              <div className="py-1">
                {entityList.map(entity => (
                  <div
                    key={entity.id}
                    className={classNames(
                      "cursor-pointer truncate px-3 py-2 text-sm transition-colors",
                      selectedEntityId === entity.id
                        ? "bg-[var(--th-accent-soft)] font-medium text-[var(--th-active-text)]"
                        : classNames(
                            themeColors.textClass,
                            "hover:bg-gray-50 dark:hover:bg-zinc-800/30"
                          )
                    )}
                    onClick={() => handleSelectEntity(entity)}
                  >
                    {entity.title || `#${entity.id}`}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 右侧：文档树 */}
          <div className="flex-1 overflow-y-auto">
            {!selectedEntityId ? (
              <div
                className={classNames(
                  "flex h-full flex-col items-center justify-center gap-2",
                  themeColors.secondaryTextClass
                )}
              >
                <InboxOutlined className="text-3xl opacity-30" />
                <span className="text-sm">{"请先选择左侧的项目"}</span>
              </div>
            ) : treeLoading ? (
              <div className="flex h-full items-center justify-center">
                <LoadingSpinner size="small" />
              </div>
            ) : (
              <div className="py-2">
                {/* 根目录选项 */}
                <div
                  className={classNames(
                    "mx-1 flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 transition-colors",
                    selectedNodeId === null
                      ? "bg-[var(--th-accent-soft)]"
                      : "hover:bg-gray-50 dark:hover:bg-zinc-800/30"
                  )}
                  onClick={() => setSelectedNodeId(null)}
                >
                  <FolderOutlined
                    className={classNames(
                      "flex-shrink-0",
                      selectedNodeId === null
                        ? "text-[var(--th-active-text)]"
                        : themeColors.secondaryTextClass
                    )}
                  />
                  <span
                    className={classNames(
                      "text-sm",
                      selectedNodeId === null
                        ? "font-medium text-[var(--th-active-text)]"
                        : themeColors.textClass
                    )}
                  >
                    {insertMode === "webview" || insertMode === "video-note"
                      ? "添加到根目录"
                      : "插入到根目录"}
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
      </CustomModal>
    );
  }
);

InsertNoteToTreeModal.displayName = "InsertNoteToTreeModal";

export default InsertNoteToTreeModal;
