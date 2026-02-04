import { useState } from "react";
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
} from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";

import type {
  VLResource,
  VLResourceStatus,
  VLResourceType,
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
import AddResourceModal from "./AddResourceModal";

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

const ResourcePanel: React.FC<ResourcePanelProps> = ({
  projectId,
  mainDbName,
  resources,
  onResourcesChange,
}) => {
  const [addResourceModalOpen, setAddResourceModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<VLResource | null>(
    null,
  );

  // 获取资源状态，同时监听资源更新事件
  const { getStatus, refresh: refreshStatus } = useResourcesStatus(
    resources,
    mainDbName,
    {
      projectId,
      onResourceUpdate: onResourcesChange,
    },
  );

  // 删除资源（包括索引和 Markdown 文件）
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

  // 重新处理资源
  const handleReprocess = useMemoizedFn(async (resource: VLResource) => {
    const status = getStatus(resource.id);

    try {
      await addVLIndexTask({
        resourceId: resource.id,
        projectId,
        mainDbName,
        originalPath: resource.originalPath,
        resourceName: resource.name,
        markdownPath: resource.markdownPath || undefined,
        type: status === "need_index" ? "index_only" : "full",
      });

      message.success("已添加到处理队列");
      refreshStatus();
    } catch (error) {
      console.error("Reprocess failed:", error);
      message.error("添加处理任务失败");
    }
  });

  // 重新索引资源（仅重建索引，不重新转换）
  const handleReindex = useMemoizedFn(async (resource: VLResource) => {
    try {
      await addVLIndexTask({
        resourceId: resource.id,
        projectId,
        mainDbName,
        originalPath: resource.originalPath,
        resourceName: resource.name,
        markdownPath: resource.markdownPath || undefined,
        type: "index_only",
      });

      message.success("已添加到索引队列");
      refreshStatus();
    } catch (error) {
      console.error("Reindex failed:", error);
      message.error("添加索引任务失败");
    }
  });

  // 分离文件名和扩展名
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

  // 开始编辑资源名称
  const handleStartEdit = useMemoizedFn((resource: VLResource) => {
    setEditingResource(resource);
    setRenameModalOpen(true);
  });

  // 取消编辑
  const handleCancelEdit = useMemoizedFn(() => {
    setRenameModalOpen(false);
    setEditingResource(null);
  });

  // 保存重命名
  const handleConfirmRename = useMemoizedFn(async (result: EditTitleResult) => {
    if (!editingResource) return;

    const trimmedBaseName = result.title.trim();
    if (!trimmedBaseName) {
      message.warning("资源名称不能为空");
      return;
    }

    // 获取原始扩展名并拼接
    const { extension } = getNameParts(editingResource.name);
    const newFullName = trimmedBaseName + extension;

    // 名称未变化，直接关闭
    if (editingResource.name === newFullName) {
      handleCancelEdit();
      return;
    }

    try {
      await updateVLResource({
        id: editingResource.id,
        name: newFullName,
      });
      message.success("重命名成功");
      onResourcesChange();
    } catch (error) {
      console.error("Rename failed:", error);
      message.error("重命名失败");
    } finally {
      handleCancelEdit();
    }
  });

  // 打开添加资源弹窗
  const handleOpenAddResourceModal = useMemoizedFn(() => {
    setAddResourceModalOpen(true);
  });

  // 关闭添加资源弹窗
  const handleCloseAddResourceModal = useMemoizedFn(() => {
    setAddResourceModalOpen(false);
  });

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

            return (
              <List.Item
                className={classNames(
                  "py-2! border-b! border-gray-100! dark:border-gray-800! last:border-b-0!",
                  { "opacity-70": config.spin },
                )}
                actions={[
                  status !== "completed" &&
                    status !== "converting" &&
                    status !== "indexing" && (
                      <Tooltip title="重新处理" key="reprocess">
                        <Button
                          type="text"
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() => handleReprocess(resource)}
                        />
                      </Tooltip>
                    ),
                  status === "completed" && (
                    <Tooltip title="重新索引" key="reindex">
                      <Button
                        type="text"
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={() => handleReindex(resource)}
                      />
                    </Tooltip>
                  ),
                  <Tooltip title="重命名" key="rename">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleStartEdit(resource)}
                    />
                  </Tooltip>,
                  <Popconfirm
                    key="delete"
                    title="确定删除此资源？"
                    onConfirm={() => handleDelete(resource)}
                    okText="删除"
                    cancelText="取消"
                  >
                    <Tooltip title="删除">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
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
                        {config.text}
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
