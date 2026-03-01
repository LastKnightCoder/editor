import { useState, useEffect, useRef } from "react";
import { Button, List, Tag, Tooltip, Popconfirm, message } from "antd";
import {
  FileOutlined,
  AudioOutlined,
  VideoCameraOutlined,
  PictureOutlined,
  FilePdfOutlined,
  DeleteOutlined,
  ReloadOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  EditOutlined,
  PlusOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";
import { Descendant } from "slate";

import type {
  VLResource,
  VLResourceStatus,
  VLResourceType,
  NoteSourceMeta,
} from "@/types/vibe-learning";
import {
  useResourcesStatus,
  statusConfig,
} from "@/hooks/useVibeLearningStatus";
import {
  updateVLResource,
  deleteVLResourceComplete,
  addVLIndexTask,
} from "@/commands/vibe-learning";
import EditTitleModal, {
  type EditTitleResult,
} from "@/components/EditTitleModal";
import LocalImage from "@/components/LocalImage";
import { remoteResourceToLocal } from "@/utils";
import { openFileWithDefaultApp } from "@/commands/file";
import { getContentById } from "@/commands";
import { Editor, EditorRef } from "@tau/editor/src";
import ErrorBoundary from "@/components/ErrorBoundary";
import useEditContent from "@/hooks/useEditContent";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import AddResourceModal from "./AddResourceModal";
import ResourcePreviewPanel from "./ResourcePreview";

type PanelView = "resource-list" | "resource-preview" | "note-preview";

interface ResourcePanelProps {
  projectId: number;
  mainDbName: string;
  resources: VLResource[];
  onResourcesChange: () => void;
}

// 根据资源类型获取图标
const getResourceIcon = (type: VLResourceType) => {
  switch (type) {
    case "pdf":
      return <FilePdfOutlined />;
    case "audio":
      return <AudioOutlined />;
    case "video":
      return <VideoCameraOutlined />;
    case "image":
      return <PictureOutlined />;
    default:
      return <FileOutlined />;
  }
};

// 根据状态获取图标
const getStatusIcon = (status: VLResourceStatus) => {
  const config = statusConfig[status];
  if (config.spin) {
    return <LoadingOutlined spin />;
  }
  switch (status) {
    case "completed":
      return <CheckCircleOutlined />;
    case "pending":
      return <ClockCircleOutlined />;
    case "need_convert":
    case "need_index":
      return <WarningOutlined />;
    case "failed":
      return <CloseCircleOutlined />;
    default:
      return <ClockCircleOutlined />;
  }
};

// 需要用系统默认程序打开的类型
const EXTERNAL_OPEN_TYPES: VLResourceType[] = [
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "txt",
  "md",
  "other",
];

const ResourcePanel: React.FC<ResourcePanelProps> = ({
  projectId,
  mainDbName,
  resources,
  onResourcesChange,
}) => {
  const dynamicExtensions = useDynamicExtensionsStore(
    (state) => state.extensions,
  );
  const [currentView, setCurrentView] = useState<PanelView>("resource-list");
  const [previewingResource, setPreviewingResource] =
    useState<VLResource | null>(null);
  const [previewingNoteMeta, setPreviewingNoteMeta] =
    useState<NoteSourceMeta | null>(null);
  const [noteContent, setNoteContent] = useState<Descendant[] | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [imagePreviewResource, setImagePreviewResource] =
    useState<VLResource | null>(null);
  const [addResourceModalOpen, setAddResourceModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<VLResource | null>(
    null,
  );

  const noteEditorRef = useRef<EditorRef>(null);

  // useEditContent 管理笔记内容保存和同步
  const handleNoteContentSync = useMemoizedFn((newContent: Descendant[]) => {
    setNoteContent(newContent);
    noteEditorRef.current?.setEditorValue(newContent);
  });
  const { throttleHandleEditorContentChange: throttleNoteContentChange } =
    useEditContent(
      previewingNoteMeta?.contentId || undefined,
      handleNoteContentSync,
    );

  // 加载笔记内容
  useEffect(() => {
    if (!previewingNoteMeta?.contentId) return;
    setNoteLoading(true);
    getContentById(previewingNoteMeta.contentId)
      .then((data) => {
        if (data) {
          setNoteContent(data.content);
        }
      })
      .catch((err) => {
        console.error("Failed to load note content:", err);
        message.error("加载笔记内容失败");
      })
      .finally(() => setNoteLoading(false));
  }, [previewingNoteMeta?.contentId]);

  const handleNoteEditorChange = useMemoizedFn((newContent: Descendant[]) => {
    setNoteContent(newContent);
    throttleNoteContentChange(newContent);
  });

  const {
    getStatus,
    getProgress,
    refresh: refreshStatus,
  } = useResourcesStatus(resources, mainDbName, {
    projectId,
    onResourceUpdate: onResourcesChange,
  });

  // 点击资源 - 根据类型分发
  const handleResourceClick = useMemoizedFn(async (resource: VLResource) => {
    // 笔记类型 → 在左侧面板中打开预览
    if (resource.sourceType === "note" && resource.sourceMetaInfo) {
      try {
        const meta: NoteSourceMeta = JSON.parse(resource.sourceMetaInfo);
        setPreviewingNoteMeta(meta);
        setNoteContent(null);
        setCurrentView("note-preview");
      } catch {
        message.error("无法解析笔记信息");
      }
      return;
    }

    // 图片类型 → 全屏 modal
    if (resource.resourceType === "image") {
      setImagePreviewResource(resource);
      return;
    }

    // 视频/音频/HTML → 侧边栏预览
    if (["video", "audio", "html"].includes(resource.resourceType)) {
      setPreviewingResource(resource);
      setCurrentView("resource-preview");
      return;
    }

    // 其它类型 → 下载到本地 + 系统默认程序打开
    if (EXTERNAL_OPEN_TYPES.includes(resource.resourceType)) {
      try {
        const localPath = await remoteResourceToLocal(resource.originalPath);
        await openFileWithDefaultApp(localPath);
      } catch (error) {
        console.error("Open file failed:", error);
        message.error("打开文件失败");
      }
    }
  });

  const handlePreviewBack = useMemoizedFn(() => {
    setCurrentView("resource-list");
    setPreviewingResource(null);
  });

  const handleNotePreviewBack = useMemoizedFn(() => {
    setCurrentView("resource-list");
    setPreviewingNoteMeta(null);
    setNoteContent(null);
  });

  const handleDelete = useMemoizedFn(async (resource: VLResource) => {
    try {
      await deleteVLResourceComplete({
        resourceId: resource.id,
        projectId,
        mainDbName,
        markdownPath: resource.markdownPath || undefined,
      });
      message.success("删除成功");
      onResourcesChange();
    } catch (error) {
      console.error("Delete failed:", error);
      message.error("删除失败");
    }
  });

  const handleReprocess = useMemoizedFn(async (resource: VLResource) => {
    const status = getStatus(resource.id);
    try {
      const result = await addVLIndexTask({
        resourceId: resource.id,
        projectId,
        mainDbName,
        originalPath: resource.originalPath,
        resourceName: resource.name,
        markdownPath: resource.markdownPath || undefined,
        type: status === "need_index" ? "index_only" : "full",
      });
      if (!result.accepted && result.reason === "already_running") {
        message.info("该资源正在处理中");
        return;
      }
      message.success("已添加到处理队列");
      refreshStatus();
    } catch (error) {
      console.error("Reprocess failed:", error);
      message.error("添加处理任务失败");
    }
  });

  const handleReindex = useMemoizedFn(async (resource: VLResource) => {
    try {
      const result = await addVLIndexTask({
        resourceId: resource.id,
        projectId,
        mainDbName,
        originalPath: resource.originalPath,
        resourceName: resource.name,
        markdownPath: resource.markdownPath || undefined,
        type: "index_only",
      });
      if (!result.accepted && result.reason === "already_running") {
        message.info("该资源正在处理中");
        return;
      }
      message.success("已添加到索引队列");
      refreshStatus();
    } catch (error) {
      console.error("Reindex failed:", error);
      message.error("添加索引任务失败");
    }
  });

  const getNameParts = useMemoizedFn((fileName: string) => {
    const lastDotIndex = fileName.lastIndexOf(".");
    if (lastDotIndex === -1 || lastDotIndex === 0) {
      return { baseName: fileName, extension: "" };
    }
    return {
      baseName: fileName.substring(0, lastDotIndex),
      extension: fileName.substring(lastDotIndex),
    };
  });

  const handleStartEdit = useMemoizedFn((resource: VLResource) => {
    setEditingResource(resource);
    setRenameModalOpen(true);
  });

  const handleCancelEdit = useMemoizedFn(() => {
    setRenameModalOpen(false);
    setEditingResource(null);
  });

  const handleConfirmRename = useMemoizedFn(async (result: EditTitleResult) => {
    if (!editingResource) return;
    const trimmedBaseName = result.title.trim();
    if (!trimmedBaseName) {
      message.warning("资源名称不能为空");
      return;
    }
    const { extension } = getNameParts(editingResource.name);
    const newFullName = trimmedBaseName + extension;
    if (editingResource.name === newFullName) {
      handleCancelEdit();
      return;
    }
    try {
      await updateVLResource({ id: editingResource.id, name: newFullName });
      message.success("重命名成功");
      onResourcesChange();
    } catch (error) {
      console.error("Rename failed:", error);
      message.error("重命名失败");
    } finally {
      handleCancelEdit();
    }
  });

  const handleOpenAddResourceModal = useMemoizedFn(() => {
    setAddResourceModalOpen(true);
  });

  const handleCloseAddResourceModal = useMemoizedFn(() => {
    setAddResourceModalOpen(false);
  });

  // 预览视图
  if (currentView === "resource-preview" && previewingResource) {
    return (
      <ResourcePreviewPanel
        resource={previewingResource}
        onBack={handlePreviewBack}
      />
    );
  }

  // 笔记预览视图
  if (currentView === "note-preview" && previewingNoteMeta) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* 头部 */}
        <div
          className="flex items-center gap-2 px-4 py-3 shrink-0
          border-b border-gray-100 dark:border-gray-800"
        >
          <Tooltip title="返回">
            <Button
              type="text"
              size="small"
              icon={<ArrowLeftOutlined />}
              onClick={handleNotePreviewBack}
            />
          </Tooltip>
          <span className="flex-1 text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap">
            {previewingNoteMeta.title || "笔记"}
          </span>
        </div>
        {/* 笔记内容 */}
        <div className="flex-1 overflow-auto p-4">
          {noteLoading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingOutlined spin className="text-2xl text-gray-400" />
            </div>
          ) : noteContent ? (
            <ErrorBoundary>
              <Editor
                key={previewingNoteMeta.contentId}
                ref={noteEditorRef}
                initValue={noteContent}
                onChange={handleNoteEditorChange}
                extensions={dynamicExtensions}
              />
            </ErrorBoundary>
          ) : (
            <div
              className="flex items-center justify-center h-full
              text-sm text-gray-400 dark:text-gray-500"
            >
              无法加载笔记内容
            </div>
          )}
        </div>
      </div>
    );
  }

  // 资源列表视图
  return (
    <div className="flex flex-col h-full p-4 overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-4">
        <h3 className="m-0 text-base font-semibold">资源</h3>
        <span className="px-2 py-0.5 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full">
          {resources.length}
        </span>
      </div>

      {/* 添加资料按钮 */}
      <div className="mb-4">
        <button
          type="button"
          onClick={handleOpenAddResourceModal}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#1f1f1f] text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 cursor-pointer"
        >
          <PlusOutlined />
          <span>添加资料</span>
        </button>
      </div>

      {/* 资源列表 */}
      <div className="flex-1 overflow-y-auto">
        <List
          dataSource={resources}
          renderItem={(resource) => {
            const status = getStatus(resource.id);
            const config = statusConfig[status];
            const progress = getProgress(resource.id);

            let tagText = config.text;
            if (progress && progress.total > 0) {
              const processed = progress.completed + progress.failed;
              const percent = Math.max(
                0,
                Math.min(100, Math.floor((processed / progress.total) * 100)),
              );
              const progressText =
                progress.failed > 0
                  ? `${percent}% · ${progress.failed}失败`
                  : `${percent}%`;
              tagText = `${config.text} (${progressText})`;
            }

            return (
              <List.Item
                className={classNames(
                  "py-2! border-b! border-gray-100! dark:border-gray-800! last:border-b-0! cursor-pointer",
                  { "opacity-70": config.spin },
                )}
                onClick={() => handleResourceClick(resource)}
                actions={[
                  !config.spin && status !== "completed" && (
                    <Tooltip title="重新处理" key="reprocess">
                      <Button
                        type="text"
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReprocess(resource);
                        }}
                      />
                    </Tooltip>
                  ),
                  status === "completed" && (
                    <Tooltip title="重新索引" key="reindex">
                      <Button
                        type="text"
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReindex(resource);
                        }}
                      />
                    </Tooltip>
                  ),
                  <Tooltip title="重命名" key="rename">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(resource);
                      }}
                    />
                  </Tooltip>,
                  <Popconfirm
                    key="delete"
                    title="确定删除此资源？"
                    onConfirm={() => handleDelete(resource)}
                    onPopupClick={(e) => e.stopPropagation()}
                    okText="删除"
                    cancelText="取消"
                  >
                    <Tooltip title="删除">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Tooltip>
                  </Popconfirm>,
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  avatar={
                    <span className="flex items-center justify-center w-8 h-8 text-base text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-md">
                      {getResourceIcon(resource.resourceType)}
                    </span>
                  }
                  title={
                    <div className="flex items-center gap-2">
                      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                        {resource.name}
                      </span>
                    </div>
                  }
                  description={
                    <div className="flex items-center mt-1">
                      <Tag
                        color={config.color}
                        icon={getStatusIcon(status)}
                        className="m-0! text-xs!"
                      >
                        {tagText}
                      </Tag>
                    </div>
                  }
                />
              </List.Item>
            );
          }}
          locale={{ emptyText: "暂无资源，请上传文件" }}
        />
      </div>

      {/* 图片全屏预览 */}
      {imagePreviewResource && (
        <div
          className="fixed inset-0 z-1000 flex items-center justify-center bg-black/60 cursor-pointer"
          onClick={() => setImagePreviewResource(null)}
        >
          <LocalImage
            url={imagePreviewResource.originalPath}
            alt={imagePreviewResource.name}
            className="max-w-[90vw] max-h-[85vh] object-contain"
          />
        </div>
      )}

      {/* 重命名弹窗 */}
      <EditTitleModal
        open={renameModalOpen}
        onCancel={handleCancelEdit}
        onConfirm={handleConfirmRename}
        initialTitle={
          editingResource ? getNameParts(editingResource.name).baseName : ""
        }
        modalTitle="重命名资源"
        modalDescription={
          editingResource
            ? `输入新的资源名称（扩展名 ${getNameParts(editingResource.name).extension || "无"} 将自动保留）`
            : "输入新的资源名称"
        }
        placeholder="请输入资源名称"
      />

      {/* 添加资料弹窗 */}
      <AddResourceModal
        open={addResourceModalOpen}
        projectId={projectId}
        mainDbName={mainDbName}
        onClose={handleCloseAddResourceModal}
        onSuccess={onResourcesChange}
      />
    </div>
  );
};

export default ResourcePanel;
