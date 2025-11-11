import { memo, useState } from "react";
import { Tag, Button, App } from "antd";
import {
  FileImageOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  FileOutlined,
  CloseOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import { IResource } from "@/types";
import LocalImage from "@/components/LocalImage";
import LocalVideo from "@/components/LocalVideo";
import LocalAudio from "@/components/LocalAudio";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import RichTextEditModal from "@/components/RichTextEditModal";
import { showInFolder, getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils";

interface ResourceDetailSidebarProps {
  resource: IResource | null;
  open: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
}

const ResourceDetailSidebar = memo((props: ResourceDetailSidebarProps) => {
  const { resource, open, width, onWidthChange, onClose } = props;
  const { message } = App.useApp();

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [currentEditingContentId, setCurrentEditingContentId] = useState<
    number | null
  >(null);
  const [currentEditingTitle, setCurrentEditingTitle] = useState("");

  // 类型标签配置
  const typeConfigs = [
    {
      type: "all",
      label: "全部",
      icon: <FileOutlined />,
      color: "default",
    },
    {
      type: "image",
      label: "图片",
      icon: <FileImageOutlined />,
      color: "blue",
    },
    {
      type: "video",
      label: "视频",
      icon: <VideoCameraOutlined />,
      color: "green",
    },
    {
      type: "audio",
      label: "音频",
      icon: <AudioOutlined />,
      color: "orange",
    },
    {
      type: "attachment",
      label: "附件",
      icon: <FileOutlined />,
      color: "purple",
    },
  ];

  // 来源类型映射
  const sourceTypeMap = {
    content: "文档",
    whiteboard: "白板",
    podcast: "播客",
  };

  // 在文件夹中显示
  const handleShowInFolder = useMemoizedFn(async () => {
    if (!resource) return;

    try {
      const { path } = resource;

      // 检查是否是远程资源
      if (path.startsWith("http")) {
        try {
          const localPath = await remoteResourceToLocal(path, resource.name);
          await showInFolder(localPath);
        } catch (downloadError) {
          console.error("下载文件失败:", downloadError);
        }
      } else {
        const homeDir = await getHomeDir();
        const absolutePath = path.startsWith("~")
          ? `${homeDir}${path.slice(1)}`
          : path;
        await showInFolder(absolutePath);
      }
    } catch (error) {
      message.error("文件不存在或无法打开");
      console.error(error);
    }
  });

  // 打开文档预览
  const handleOpenDocument = useMemoizedFn(
    (contentId: number, title: string) => {
      setCurrentEditingContentId(contentId);
      setCurrentEditingTitle(title);
      setEditModalVisible(true);
    },
  );

  if (!resource) return null;

  return (
    <>
      <ResizableAndHideableSidebar
        width={width}
        open={open}
        onWidthChange={onWidthChange}
        minWidth={320}
        maxWidth={800}
        side="left"
        className="h-full border-l border-gray-200 dark:border-white/10"
      >
        <div className="h-full overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center mb-4">
              <CloseOutlined
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer mr-3 transition-colors"
                style={{ fontSize: "16px" }}
                onClick={onClose}
              />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                资源详情
              </h2>
            </div>

            <div className="space-y-4">
              {/* 预览 */}
              {resource.type === "image" && (
                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center p-4">
                  <LocalImage
                    url={resource.path}
                    alt={resource.name}
                    className="w-full rounded-lg"
                    style={{ maxHeight: "25em", objectFit: "contain" }}
                  />
                </div>
              )}
              {resource.type === "video" && (
                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                  <LocalVideo
                    src={resource.path}
                    controls
                    className="w-full"
                    style={{ maxHeight: "25em" }}
                  />
                </div>
              )}
              {resource.type === "audio" && (
                <div className="w-full">
                  <LocalAudio src={resource.path} controls className="w-full" />
                </div>
              )}

              {/* 信息 */}
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    资源名称
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100">
                    {resource.name}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    资源路径
                  </div>
                  <div className="text-xs text-gray-900 dark:text-gray-100 break-all bg-gray-50 dark:bg-gray-800 p-2 rounded mb-2">
                    {resource.path}
                  </div>
                  <Button
                    type="default"
                    size="small"
                    icon={<FolderOpenOutlined />}
                    onClick={handleShowInFolder}
                  >
                    在文件夹中显示
                  </Button>
                </div>

                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    资源类型
                  </div>
                  <Tag
                    color={
                      typeConfigs.find((c) => c.type === resource.type)?.color
                    }
                  >
                    {typeConfigs.find((c) => c.type === resource.type)?.label}
                  </Tag>
                </div>

                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    引用次数
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100">
                    {resource.refCount} 次
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    来源信息
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {resource.sources.map((source, index) => {
                      const isContent = source.type === "content";
                      return isContent ? (
                        <Tag
                          key={index}
                          icon={<FileTextOutlined />}
                          color="cyan"
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() =>
                            handleOpenDocument(source.id, resource.name)
                          }
                        >
                          {sourceTypeMap[source.type]} (ID: {source.id})
                        </Tag>
                      ) : (
                        <Tag key={index}>
                          {sourceTypeMap[source.type]} (ID: {source.id})
                        </Tag>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ResizableAndHideableSidebar>

      {/* 文档预览弹窗 */}
      {currentEditingContentId && (
        <RichTextEditModal
          visible={editModalVisible}
          contentId={currentEditingContentId}
          title={currentEditingTitle}
          onClose={() => {
            setEditModalVisible(false);
            setCurrentEditingContentId(null);
            setCurrentEditingTitle("");
          }}
        />
      )}
    </>
  );
});

export default ResourceDetailSidebar;
