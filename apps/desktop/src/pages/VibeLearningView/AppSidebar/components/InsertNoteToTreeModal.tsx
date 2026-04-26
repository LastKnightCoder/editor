import { memo, useState, useEffect, useCallback, useMemo } from "react";
import { Descendant } from "slate";
import { App } from "antd";
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
import { LoadingSpinner } from "./index";
import { getProjectList } from "@/commands/project";
import { getAllDocuments } from "@/commands/document";
import {
  addRootProjectItem,
  addChildProjectItem,
  createSharedProjectItemFromContent,
} from "@/commands/project";
import {
  addRootDocumentItem,
  addChildDocumentItem,
  createSharedDocumentItemFromContent,
} from "@/commands/document";
import { getContentById } from "@/commands";
import { getContentLength } from "@/utils";
import { EProjectType, EProjectItemType } from "@/types/project";
import type { CreateProjectItem, Project } from "@/types/project";
import type { IDocument, ICreateDocumentItem } from "@/types/document";
import {
  buildProjectTree,
  buildDocumentTree,
} from "@/pages/Settings/PublishSetting/PublishSelector/utils/treeBuilder";
import type { DocTreeNode } from "@/pages/Settings/PublishSetting/PublishSelector/types";

interface InsertNoteToTreeModalProps {
  mode: "project" | "document";
  open: boolean;
  noteTitle: string;
  noteContent: Descendant[];
  sourceContentId?: number | null;
  insertMode?: "copy" | "shared-content";
  onCancel: () => void;
  onSuccess: () => void;
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
          "flex items-center gap-2 px-3 py-1.5 transition-colors cursor-pointer mx-1 rounded-md",
          isSelected
            ? "bg-blue-50 dark:bg-blue-500/10"
            : "hover:bg-gray-50 dark:hover:bg-zinc-800/30",
        )}
        style={{ paddingLeft: depth * 12 + 12 }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <span
            className={classNames(
              "flex-shrink-0 text-xs",
              themeColors.secondaryTextClass,
            )}
            onClick={(e) => {
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
          <FolderOutlined
            className={classNames(
              "flex-shrink-0",
              themeColors.secondaryTextClass,
            )}
          />
        ) : (
          <FileOutlined
            className={classNames(
              "flex-shrink-0",
              themeColors.secondaryTextClass,
            )}
          />
        )}
        <span
          className={classNames(
            "flex-1 text-sm truncate",
            isSelected
              ? "text-blue-600 dark:text-blue-400 font-medium"
              : themeColors.textClass,
          )}
        >
          {node.title}
        </span>
      </div>
      {expanded &&
        node.children.map((child) => (
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
    onCancel,
    onSuccess,
  }) => {
    const { message } = App.useApp();
    const themeColors = useThemeColors();

    const [projects, setProjects] = useState<Project[]>([]);
    const [documents, setDocuments] = useState<IDocument[]>([]);
    const [selectedEntityId, setSelectedEntityId] = useState<number | null>(
      null,
    );
    const [treeNodes, setTreeNodes] = useState<DocTreeNode[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [treeLoading, setTreeLoading] = useState(false);
    const [inserting, setInserting] = useState(false);

    // 加载项目或知识库列表
    useEffect(() => {
      if (!open) return;
      setLoading(true);
      if (mode === "project") {
        getProjectList()
          .then((allProjects) => {
            setProjects(
              allProjects.filter(
                (p) =>
                  p.projectType === EProjectType.DocumentTree && !p.archived,
              ),
            );
          })
          .catch(() => message.error("加载列表失败"))
          .finally(() => setLoading(false));
      } else {
        getAllDocuments()
          .then((allDocs) => {
            setDocuments(allDocs);
          })
          .catch(() => message.error("加载列表失败"))
          .finally(() => setLoading(false));
      }
    }, [open, mode, message]);

    // 关闭时重置状态
    useEffect(() => {
      if (!open) {
        setSelectedEntityId(null);
        setTreeNodes([]);
        setSelectedNodeId(null);
      }
    }, [open]);

    // 当前 mode 对应的列表
    const entityList = useMemo(
      () => (mode === "project" ? projects : documents),
      [mode, projects, documents],
    );

    // 选择项目/知识库，加载文档树
    const handleSelectEntity = useCallback(
      async (entity: Project | IDocument) => {
        setSelectedEntityId(entity.id);
        setSelectedNodeId(null);
        setTreeLoading(true);
        try {
          const nodes =
            mode === "project"
              ? await buildProjectTree(entity as Project)
              : await buildDocumentTree(entity as IDocument);
          setTreeNodes(nodes);
        } catch {
          setTreeNodes([]);
        } finally {
          setTreeLoading(false);
        }
      },
      [mode],
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
          if (mode === "project") {
            await createSharedProjectItemFromContent({
              sourceContentId,
              projectId: selectedEntityId,
              parentProjectItemId: selectedNodeId,
              title,
            });
          } else {
            await createSharedDocumentItemFromContent({
              sourceContentId,
              documentId: selectedEntityId,
              parentDocumentItemId: selectedNodeId,
              title,
            });
          }
          message.success("内容已挂载");
        } else {
          let contentToInsert = noteContent;
          if (sourceContentId) {
            const contentData = await getContentById(sourceContentId);
            if (contentData) {
              contentToInsert = contentData.content;
            }
          }
          const count = getContentLength(contentToInsert);

          if (mode === "project") {
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
          } else {
            const newItem: ICreateDocumentItem = {
              title: noteTitle || "VL 笔记",
              content: contentToInsert,
              children: [],
              tags: [],
              isArticle: false,
              articleId: 0,
              isCard: false,
              cardId: 0,
              refType: "",
              refId: 0,
              parents: [],
              count,
            };
            if (selectedNodeId) {
              await addChildDocumentItem(selectedNodeId, newItem);
            } else {
              await addRootDocumentItem(selectedEntityId, newItem);
            }
          }
          message.success("笔记已插入");
        }
        onSuccess();
      } catch (error) {
        console.error("Failed to insert note:", error);
        message.error(
          insertMode === "shared-content" ? "挂载内容失败" : "插入笔记失败",
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
      message,
      onSuccess,
    ]);

    return (
      <CustomModal
        open={open}
        onCancel={onCancel}
        width={680}
        bodyClassName="!p-0"
        title={
          mode === "project"
            ? insertMode === "shared-content"
              ? "创建项目文档"
              : "插入笔记到项目"
            : insertMode === "shared-content"
              ? "创建知识库文档"
              : "插入笔记到知识库"
        }
        onOk={handleConfirm}
        okText={insertMode === "shared-content" ? "创建" : "插入"}
        cancelText="取消"
        confirmLoading={inserting}
        okButtonProps={{ disabled: !selectedEntityId }}
      >
        {/* 左右布局 */}
        <div className="flex" style={{ height: 400 }}>
          {/* 左侧：项目/知识库列表 */}
          <div
            className={classNames(
              "w-56 flex-shrink-0 border-r overflow-y-auto",
              themeColors.cardBorderClass,
            )}
          >
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <LoadingSpinner size="small" />
              </div>
            ) : entityList.length === 0 ? (
              <div
                className={classNames(
                  "flex items-center justify-center h-full text-sm",
                  themeColors.secondaryTextClass,
                )}
              >
                {mode === "project" ? "暂无文档类型项目" : "暂无知识库"}
              </div>
            ) : (
              <div className="py-1">
                {entityList.map((entity) => (
                  <div
                    key={entity.id}
                    className={classNames(
                      "px-3 py-2 cursor-pointer text-sm truncate transition-colors",
                      selectedEntityId === entity.id
                        ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
                        : classNames(
                            themeColors.textClass,
                            "hover:bg-gray-50 dark:hover:bg-zinc-800/30",
                          ),
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
                  "flex flex-col items-center justify-center h-full gap-2",
                  themeColors.secondaryTextClass,
                )}
              >
                <InboxOutlined className="text-3xl opacity-30" />
                <span className="text-sm">
                  {mode === "project"
                    ? "请先选择左侧的项目"
                    : "请先选择左侧的知识库"}
                </span>
              </div>
            ) : treeLoading ? (
              <div className="flex items-center justify-center h-full">
                <LoadingSpinner size="small" />
              </div>
            ) : (
              <div className="py-2">
                {/* 根目录选项 */}
                <div
                  className={classNames(
                    "flex items-center gap-2 px-3 py-1.5 cursor-pointer mx-1 rounded-md transition-colors",
                    selectedNodeId === null
                      ? "bg-blue-50 dark:bg-blue-500/10"
                      : "hover:bg-gray-50 dark:hover:bg-zinc-800/30",
                  )}
                  onClick={() => setSelectedNodeId(null)}
                >
                  <FolderOutlined
                    className={classNames(
                      "flex-shrink-0",
                      selectedNodeId === null
                        ? "text-blue-600 dark:text-blue-400"
                        : themeColors.secondaryTextClass,
                    )}
                  />
                  <span
                    className={classNames(
                      "text-sm",
                      selectedNodeId === null
                        ? "text-blue-600 dark:text-blue-400 font-medium"
                        : themeColors.textClass,
                    )}
                  >
                    插入到根目录
                  </span>
                </div>
                {/* 文档树节点 */}
                {treeNodes.map((node) => (
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
  },
);

InsertNoteToTreeModal.displayName = "InsertNoteToTreeModal";

export default InsertNoteToTreeModal;
