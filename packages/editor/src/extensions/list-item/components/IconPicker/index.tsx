import React, { useState, useEffect } from "react";
import { Button, FileDropZone, Tabs, type TabItem } from "@tau/ui";
import { Inbox, Trash2 } from "lucide-react";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import useTheme from "../../../../hooks/useTheme";
import { useNotifier } from "../../../../services/hooks";

export interface IconPickerProps {
  onEmojiSelect: (emoji: string) => void;
  onImageSelect: (url: string) => void;
  onRemoveIcon?: () => void;
  uploadResource?: (file: File) => Promise<string | undefined>;
  hasIcon?: boolean;
}

const IconPicker: React.FC<IconPickerProps> = ({
  onEmojiSelect,
  onImageSelect,
  onRemoveIcon,
  uploadResource,
  hasIcon = false,
}) => {
  const { isDark } = useTheme();
  const message = useNotifier();
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<"emoji" | "upload">("emoji");

  const handleEmojiSelect = (emojiData: any) => {
    onEmojiSelect(emojiData.native);
  };

  const handleUploadImage = async (file: File) => {
    if (!uploadResource) {
      message.error("上传功能未配置");
      return;
    }

    setUploading(true);
    try {
      const url = await uploadResource(file);
      if (url) {
        onImageSelect(url);
        message.success("上传成功");
      } else {
        message.error("上传失败");
      }
    } catch (error) {
      console.error("上传图片时出错:", error);
      message.error("上传出错");
    } finally {
      setUploading(false);
    }
  };

  const handleDroppedFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      message.error("请上传图片文件");
      return;
    }
    void handleUploadImage(file);
  };

  // 监听粘贴事件
  useEffect(() => {
    if (activeTab !== "upload") return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      // 遍历剪贴板项，查找图片
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // 检查是否为图片类型
        if (item.type.indexOf("image") !== -1) {
          e.preventDefault();
          const file = item.getAsFile();

          if (file) {
            await handleUploadImage(file);
          }
          break;
        }
      }
    };

    // 添加事件监听
    document.addEventListener("paste", handlePaste);

    // 清理函数
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [activeTab, uploadResource, onImageSelect]);

  const tabItems: TabItem<"emoji" | "upload">[] = [
    {
      key: "emoji",
      label: "表情",
      children: (
        <div className="flex items-center justify-center px-3 pb-3 [&_em-emoji-picker]:rounded-none [&_em-emoji-picker]:border-0 [&_em-emoji-picker]:shadow-none">
          <Picker
            data={data}
            theme={isDark ? "dark" : "light"}
            onEmojiSelect={handleEmojiSelect}
            locale="zh"
            previewPosition="none"
            skinTonePosition="none"
            set="native"
          />
        </div>
      ),
    },
    {
      key: "upload",
      label: "上传图片",
      children: (
        <div className="min-w-[360px] px-5 pb-5 pt-3">
          <FileDropZone
            accept="image/*"
            onFile={handleDroppedFile}
            disabled={uploading}
            className="min-h-[200px]"
          >
            <Inbox size={40} strokeWidth={1.5} className="text-ink-3" />
            <p className="text-tau-body text-ink-1 m-0">
              {uploading ? "上传中..." : "点击或拖拽图片到此处"}
            </p>
            <p className="text-tau-sm text-ink-3 m-0">支持 JPG、PNG、GIF 等格式，也可直接粘贴</p>
          </FileDropZone>
        </div>
      ),
    },
  ];

  return (
    <div className="overflow-hidden pt-2">
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} centered />
      {hasIcon && onRemoveIcon && (
        <div className="border-line-2 border-t px-4 pb-4 pt-3">
          <Button variant="danger-soft" icon={Trash2} block onClick={onRemoveIcon}>
            移除图标
          </Button>
        </div>
      )}
    </div>
  );
};

export default IconPicker;
