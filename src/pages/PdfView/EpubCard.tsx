import React, { useState } from "react";
import classnames from "classnames";
import { Popover, App, Tag, Progress } from "antd";

import { MdMoreVert } from "react-icons/md";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import useTheme from "@/hooks/useTheme";
import useEpubsStore from "@/stores/useEpubsStore";
import useUploadResource from "@/hooks/useUploadResource";
import { readBinaryFile } from "@/commands";
import { Epub } from "@/types";

interface EpubCardProps {
  epub: Epub;
  className?: string;
  style?: React.CSSProperties;
  compact?: boolean;
}

const EpubCard = (props: EpubCardProps) => {
  const { className, style, epub, compact = false } = props;

  const navigateTo = useTabStore((state) => state.navigateTo);
  const { modal, message } = App.useApp();
  const { isDark } = useTheme();
  const [settingOpen, setSettingOpen] = useState(false);
  const uploadResource = useUploadResource();

  const { removeEpub, activeEpub, updateEpub } = useEpubsStore((state) => ({
    removeEpub: state.removeEpub,
    activeEpub: state.activeEpub,
    updateEpub: state.updateEpub,
  }));

  const onRemoveEpub = () => {
    modal.confirm({
      title: "删除EPUB",
      content: "确定删除该EPUB吗？",
      onOk: async () => {
        await removeEpub(epub.id);
        if (activeEpub?.id === epub.id) {
          useEpubsStore.setState({
            activeEpub: null,
          });
        }
      },
      cancelText: "取消",
      okText: "确定",
      okButtonProps: {
        danger: true,
      },
    });
  };

  const onUploadEpub = () => {
    modal.confirm({
      title: "上传EPUB",
      content: "确定要将此EPUB文件上传到云端吗？上传成功后将变为远程资源。",
      onOk: async () => {
        try {
          message.loading({
            key: "uploading-epub",
            content: "正在上传文件...",
            duration: 0,
          });

          const fileContent = (await readBinaryFile(
            epub.filePath,
          )) as Uint8Array<ArrayBuffer>;
          const file = new File([fileContent], epub.fileName, {
            type: "application/epub+zip",
          });

          const uploadedUrl = await uploadResource(file);
          if (uploadedUrl) {
            await updateEpub({
              ...epub,
              isLocal: false,
              remoteUrl: uploadedUrl,
              filePath: "",
            });
            message.success({ key: "uploading-epub", content: "文件上传成功" });
          } else {
            message.error({ key: "uploading-epub", content: "文件上传失败" });
          }
        } catch (error) {
          console.error("上传文件失败:", error);
          message.error({ key: "uploading-epub", content: "文件上传失败" });
        }
      },
      cancelText: "取消",
      okText: "确定上传",
    });
  };

  const onClick = () => {
    if (compact) {
      useEpubsStore.setState({
        activeEpub: epub.id === activeEpub?.id ? null : epub,
      });
    } else {
      navigateTo(
        TabType.EpubDetail,
        { id: epub.id },
        `EPUB - ${epub.title || epub.fileName || `#${epub.id}`}`,
      );
    }
  };

  const progressPercent = Math.round((epub.progressPercentage || 0) * 100);

  return (
    <div
      className={classnames(
        "flex gap-4 flex-col p-8 shadow-md rounded-2xl transition-all duration-200 ease-in-out cursor-pointer relative box-border",
        {
          "bg-[#18151f] shadow-lg": isDark,
          "p-4 gap-2": compact,
        },
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(
          -30deg,
          rgba(26, 189, 125, 0.1),
          transparent 50%
        )`,
        ...style,
      }}
    >
      <div
        className={classnames(
          "select-none font-bold text-3xl overflow-hidden text-ellipsis line-clamp-2",
          { "text-lg line-clamp-2": compact },
        )}
        onClick={onClick}
      >
        {epub.title || epub.fileName}
      </div>
      {epub.author && !compact && (
        <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
          {epub.author}
        </div>
      )}
      <div className="mt-auto flex items-center gap-2">
        <Tag color={epub.isLocal ? "green" : "orange"}>
          {epub.isLocal ? "本地" : "远程"}
        </Tag>
        <Tag color="purple">EPUB</Tag>
        {progressPercent > 0 && (
          <Progress
            percent={progressPercent}
            size="small"
            style={{ flex: 1, minWidth: 60, maxWidth: 100 }}
            showInfo={false}
          />
        )}
      </div>
      <div
        className={classnames(
          "absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center rounded-full hover:cursor-pointer hover:bg-white/20",
          { "w-5 h-5 top-2 right-2": compact },
        )}
      >
        <Popover
          open={settingOpen}
          onOpenChange={setSettingOpen}
          placement={"bottomRight"}
          trigger={"click"}
          styles={{
            content: {
              padding: 4,
            },
          }}
          content={
            <div className="flex gap-2.5 flex-col">
              {epub.isLocal && (
                <div
                  className="px-4 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                  onClick={() => {
                    setSettingOpen(false);
                    onUploadEpub();
                  }}
                >
                  上传资源
                </div>
              )}
              <div
                className="px-4 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                onClick={onRemoveEpub}
              >
                删除EPUB
              </div>
            </div>
          }
        >
          <MdMoreVert />
        </Popover>
      </div>
    </div>
  );
};

export default EpubCard;
