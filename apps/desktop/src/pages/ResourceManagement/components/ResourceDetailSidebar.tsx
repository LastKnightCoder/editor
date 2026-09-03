import { memo, useState } from "react";
import type { ReactNode } from "react";
import { App, Button } from "antd";
import {
  X,
  FolderOpen,
  FileText,
  Presentation,
  Mic,
  MessageSquare,
  BookOpen,
} from "lucide-react";
import classNames from "classnames";
import { useMemoizedFn } from "ahooks";
import { IResource, type IResourceSource } from "@/types";
import LocalImage from "@/components/LocalImage";
import LocalVideo from "@/components/LocalVideo";
import LocalAudio from "@/components/LocalAudio";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import RichTextEditModal from "@/components/RichTextEditModal";
import { showInFolder, getHomeDir } from "@/commands";
import { remoteResourceToLocal } from "@/utils";
import useThemeColors from "@/hooks/useThemeColors";
import { getResourceTypeConfig, SOURCE_TYPE_MAP } from "../constants";

interface ResourceDetailSidebarProps {
  resource: IResource | null;
  open: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const SOURCE_ICONS: Record<IResourceSource["type"], ReactNode> = {
  content: <FileText size={12} />,
  whiteboard: <Presentation size={12} />,
  podcast: <Mic size={12} />,
  chat: <MessageSquare size={12} />,
  ebook: <BookOpen size={12} />,
};

const ResourceDetailSidebar = memo((props: ResourceDetailSidebarProps) => {
  const { resource, open, width, onWidthChange, onClose } = props;
  const { message } = App.useApp();
  const themeColors = useThemeColors();

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [currentEditingContentId, setCurrentEditingContentId] = useState<
    number | null
  >(null);
  const [currentEditingTitle, setCurrentEditingTitle] = useState("");

  const handleShowInFolder = useMemoizedFn(async () => {
    if (!resource) return;
    try {
      const { path } = resource;
      if (path.startsWith("http")) {
        const localPath = await remoteResourceToLocal(path, resource.name);
        await showInFolder(localPath);
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

  const handleOpenDocument = useMemoizedFn(
    (contentId: number, title: string) => {
      setCurrentEditingContentId(contentId);
      setCurrentEditingTitle(title);
      setEditModalVisible(true);
    },
  );

  if (!resource) return null;

  const typeConfig = getResourceTypeConfig(resource.type);
  const TypeIcon = typeConfig.icon;

  const metaRow = (label: string, value: ReactNode) => (
    <div className="flex gap-3 py-1.5">
      <span
        className={classNames(
          "w-16 shrink-0 text-xs pt-0.5",
          themeColors.secondaryTextClass,
        )}
      >
        {label}
      </span>
      <span
        className={classNames(
          "flex-1 min-w-0 text-xs break-all",
          themeColors.textClass,
        )}
      >
        {value}
      </span>
    </div>
  );

  return (
    <>
      <ResizableAndHideableSidebar
        width={width}
        open={open}
        onWidthChange={onWidthChange}
        minWidth={320}
        maxWidth={800}
        side="left"
        className={classNames(
          "h-full border-l",
          themeColors.borderClass,
          "bg-[var(--th-card-bg)]",
        )}
      >
        <div className="h-full overflow-y-auto">
          <div className="p-5">
            {/* 头部 */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={onClose}
                className={classNames(
                  "w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors",
                  themeColors.hoverClass,
                  themeColors.secondaryTextClass,
                )}
              >
                <X size={16} />
              </button>
              <h2
                className={classNames(
                  "text-base font-semibold",
                  themeColors.textClass,
                )}
              >
                资源详情
              </h2>
            </div>

            <div className="space-y-5">
              {/* 预览 */}
              <div
                className={classNames(
                  "rounded-xl overflow-hidden border flex items-center justify-center",
                  themeColors.borderClass,
                  themeColors.inputBgClass,
                )}
              >
                {resource.type === "image" && (
                  <LocalImage
                    url={resource.path}
                    alt={resource.name}
                    className="w-full"
                    style={{ maxHeight: "24em", objectFit: "contain" }}
                  />
                )}
                {resource.type === "video" && (
                  <LocalVideo
                    src={resource.path}
                    controls
                    className="w-full"
                    style={{ maxHeight: "24em" }}
                  />
                )}
                {resource.type === "audio" && (
                  <div className="w-full p-4">
                    <LocalAudio
                      src={resource.path}
                      controls
                      className="w-full"
                    />
                  </div>
                )}
                {(resource.type === "pdf" ||
                  resource.type === "epub" ||
                  resource.type === "attachment") && (
                  <div
                    className={classNames(
                      "w-full aspect-[4/3] bg-linear-to-br flex flex-col items-center justify-center gap-2",
                      typeConfig.tileClass,
                    )}
                  >
                    <TypeIcon
                      size={40}
                      strokeWidth={1.5}
                      className="text-white/90"
                    />
                    <span className="text-xs text-white/80">
                      {typeConfig.label}
                    </span>
                  </div>
                )}
              </div>

              {/* 名称与类型 */}
              <div
                className={classNames(
                  "rounded-xl border p-3",
                  themeColors.borderClass,
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={classNames(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px]",
                      themeColors.tagBgClass,
                      themeColors.secondaryTextClass,
                    )}
                  >
                    <TypeIcon size={11} />
                    {typeConfig.label}
                  </span>
                  {resource.refCount > 0 && (
                    <span
                      className={classNames(
                        "text-[11px]",
                        themeColors.secondaryTextClass,
                      )}
                    >
                      引用 {resource.refCount} 次
                    </span>
                  )}
                </div>
                <div
                  className={classNames(
                    "text-sm font-medium break-all",
                    themeColors.textClass,
                  )}
                >
                  {resource.name}
                </div>
              </div>

              {/* 元信息 */}
              <div
                className={classNames(
                  "rounded-xl border px-3 py-2",
                  themeColors.borderClass,
                )}
              >
                {metaRow(
                  "路径",
                  <span className="flex items-start gap-2">
                    <span className="break-all flex-1">{resource.path}</span>
                    <button
                      onClick={handleShowInFolder}
                      title="在文件夹中显示"
                      className={classNames(
                        "shrink-0 w-6 h-6 rounded-md flex items-center justify-center cursor-pointer transition-colors",
                        themeColors.hoverClass,
                        themeColors.secondaryTextClass,
                      )}
                    >
                      <FolderOpen size={13} />
                    </button>
                  </span>,
                )}
                {metaRow("创建时间", formatTime(resource.createTime))}
                {metaRow("更新时间", formatTime(resource.updateTime))}
              </div>

              {/* 来源 */}
              <div>
                <div
                  className={classNames(
                    "text-xs mb-2",
                    themeColors.secondaryTextClass,
                  )}
                >
                  来源
                </div>
                {resource.sources.length === 0 ? (
                  <div
                    className={classNames(
                      "text-xs",
                      themeColors.secondaryTextClass,
                    )}
                  >
                    手动上传,无内容引用
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {resource.sources.map((source) => {
                      const config = SOURCE_TYPE_MAP[source.type];
                      if (!config) return null;
                      const key = `${source.type}-${source.id}`;
                      const clickable = source.type === "content";
                      return (
                        <button
                          key={key}
                          disabled={!clickable}
                          onClick={() =>
                            clickable &&
                            handleOpenDocument(source.id, resource.name)
                          }
                          className={classNames(
                            "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition-colors",
                            themeColors.borderClass,
                            themeColors.tagBgClass,
                            themeColors.textClass,
                            clickable &&
                              classNames(
                                "cursor-pointer",
                                themeColors.hoverClass,
                              ),
                          )}
                        >
                          {SOURCE_ICONS[source.type]}
                          {config.label}
                          <span className="opacity-50">#{source.id}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 操作 */}
              <Button
                block
                icon={<FolderOpen size={14} />}
                onClick={handleShowInFolder}
              >
                在文件夹中显示
              </Button>
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
