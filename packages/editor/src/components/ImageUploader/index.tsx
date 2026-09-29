import React, { useCallback, useState } from "react";
import { Inbox, Upload } from "lucide-react";
import { Button, FileDropZone, Input, Popover, Spinner, Tabs, cn, type TabItem } from "@tau/ui";

import { useNotifier } from "../../services/hooks";

interface ImageUploaderProps {
  /**
   * 是否为行内图片模式
   */
  inline?: boolean;
  /**
   * 是否展示自带的上传/网络 Tab
   */
  showTabs?: boolean;
  /**
   * 图片加载中状态
   */
  loading?: boolean;
  /**
   * 上传成功回调
   */
  onUploadSuccess: (url: string) => void;
  /**
   * 上传失败回调
   */
  onUploadFailed?: () => void;
  /**
   * 图片上传函数，外部提供
   */
  uploadResource?: (file: File) => Promise<string | undefined>;
}

type UploaderTab = "upload" | "link";

/**
 * 图片上传组件，只处理上传功能，不包含显示逻辑
 */
const ImageUploader: React.FC<ImageUploaderProps> = ({
  inline = false,
  showTabs = true,
  loading = false,
  onUploadSuccess,
  onUploadFailed,
  uploadResource,
}) => {
  const message = useNotifier();
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [linkValue, setLinkValue] = useState("");

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!uploadResource) return;

      if (!file.type.startsWith("image/")) {
        message.error("请上传图片文件");
        return;
      }

      try {
        const uploadedUrl = await uploadResource(file);
        if (uploadedUrl) {
          onUploadSuccess(uploadedUrl);
          setPopoverVisible(false);
        } else {
          message.error("图片上传失败");
          onUploadFailed?.();
        }
      } catch (error) {
        console.error("上传图片时出错:", error);
        message.error("图片上传出错");
        onUploadFailed?.();
      }
    },
    [message, onUploadSuccess, onUploadFailed, uploadResource]
  );

  const handleLinkConfirm = useCallback(() => {
    if (linkValue.trim()) {
      onUploadSuccess(linkValue.trim());
      setLinkValue("");
      setPopoverVisible(false);
    } else {
      message.error("请输入有效的图片链接");
    }
  }, [linkValue, message, onUploadSuccess]);

  const linkForm = (
    <div className="flex items-center gap-3 py-2">
      <Input
        value={linkValue}
        onChange={e => setLinkValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") handleLinkConfirm();
        }}
        placeholder="请输入网络图片地址"
      />
      <Button onClick={handleLinkConfirm}>确定</Button>
    </div>
  );

  const tabItems = (compact: boolean): TabItem<UploaderTab>[] => [
    {
      key: "upload",
      label: "本地上传",
      children: (
        <FileDropZone
          accept="image/*"
          onFile={file => void handleUploadFile(file)}
          className={compact ? "min-h-[100px] gap-1 py-3" : "min-h-[11.25em]"}
        >
          <Inbox
            size={compact ? 24 : 40}
            strokeWidth={1.5}
            className="text-[var(--ed-text-tertiary)]"
          />
          <p className="m-0 text-[0.875em] text-[var(--ed-text-secondary)]">
            {compact ? "点击或拖拽图片" : "点击或拖拽图片到此处上传"}
          </p>
        </FileDropZone>
      ),
    },
    { key: "link", label: "网络图片", children: linkForm },
  ];

  if (inline) {
    return (
      <div className="mx-0.5 inline-flex h-[1.5em] items-center justify-center overflow-hidden rounded border border-dashed border-[var(--ed-border)] px-1 py-0.5 align-middle">
        {loading ? (
          <Spinner className="size-[1em]" />
        ) : (
          <Popover
            open={popoverVisible}
            onOpenChange={setPopoverVisible}
            placement="bottom"
            className="w-[300px] p-3"
            trigger={
              <button
                type="button"
                className="inline-flex h-full cursor-pointer items-center gap-1 px-1 text-[12px] text-[var(--ed-text-secondary)] hover:text-[var(--ed-accent)]"
              >
                <Upload size="1em" />
                上传图片
              </button>
            }
          >
            <Tabs<UploaderTab> defaultActiveKey="upload" items={tabItems(true)} />
          </Popover>
        )}
      </div>
    );
  }

  const blockArea = loading ? (
    <div className="flex min-h-[11.25em] items-center justify-center">
      <Spinner className="size-5" />
    </div>
  ) : showTabs ? (
    <Tabs<UploaderTab>
      defaultActiveKey="upload"
      items={tabItems(false)}
      className="w-full min-w-[380px]"
    />
  ) : (
    tabItems(false)[0].children
  );

  return (
    <div
      className={cn(
        showTabs &&
          "flex items-center justify-center overflow-hidden rounded border border-dashed border-[var(--ed-border)] bg-[var(--ed-bg-sunken)] px-4 py-2 transition-colors hover:border-[var(--ed-accent)]"
      )}
    >
      {blockArea}
    </div>
  );
};

export default ImageUploader;
