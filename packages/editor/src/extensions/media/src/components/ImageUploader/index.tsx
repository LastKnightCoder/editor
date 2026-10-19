import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSlateStatic } from "slate-react";
import { Transforms } from "slate";
import { Inbox, Upload } from "lucide-react";
import { Button, FileDropZone, Input, Popover, Spinner, Tabs, cn, type TabItem } from "@tau/ui";

import { useNotifier, OverlayBackDismiss, captureElementSubmission } from "@tau/editor/api";
import type { InlineImageElement } from "../../types";
import { beginMediaSubmission } from "../../utils/mediaSubmission";
import { uploadMedia } from "../../utils/uploadMedia";

interface ImageUploaderProps {
  element: InlineImageElement;
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
}

type UploaderTab = "upload" | "link";

/**
 * 图片上传组件，只处理上传功能，不包含显示逻辑
 */
const ImageUploader: React.FC<ImageUploaderProps> = ({
  element,
  inline = false,
  showTabs = true,
  loading = false,
}) => {
  const message = useNotifier();
  const editor = useSlateStatic();
  const pending = useRef<ReturnType<typeof beginMediaSubmission>>(null);
  const inputSession = useRef<ReturnType<
    typeof captureElementSubmission<InlineImageElement>
  > | null>(null);
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const changeOpen = (open: boolean) => {
    if (!open) {
      pending.current?.dispose();
      inputSession.current?.dispose();
    } else {
      inputSession.current?.dispose();
      const session = captureElementSubmission(editor, {
        element,
        accept: current => current.url === element.url,
      });
      if (session.check()) {
        session.dispose();
        return;
      }
      inputSession.current = session;
      session.signal.addEventListener(
        "abort",
        () => {
          if (inputSession.current === session) {
            inputSession.current = null;
            setPopoverVisible(false);
          }
        },
        { once: true }
      );
    }
    setPopoverVisible(open);
  };
  useEffect(
    () => () => {
      pending.current?.dispose();
      inputSession.current?.dispose();
    },
    []
  );

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (inline && (!inputSession.current || inputSession.current.check())) return;
      if (!file.type.startsWith("image/")) {
        message.error("请上传图片文件");
        return;
      }

      const submission = beginMediaSubmission(editor, element, {
        signal: inputSession.current?.signal,
      });
      if (!submission) return;
      pending.current = submission;
      if (await uploadMedia(editor, file, submission)) {
        inputSession.current?.dispose();
        setPopoverVisible(false);
      }
    },
    [message, editor, element, inline]
  );

  const handleLinkConfirm = useCallback(() => {
    if (linkValue.trim()) {
      const submission =
        inputSession.current ?? (inline ? null : captureElementSubmission(editor, { element }));
      if (!submission) return;
      try {
        submission.commit(({ path }) => {
          Transforms.setNodes(editor, { url: linkValue.trim() }, { at: path });
        });
      } finally {
        submission.dispose();
      }
      setLinkValue("");
      setPopoverVisible(false);
    } else {
      message.error("请输入有效的图片链接");
    }
  }, [linkValue, message, editor, element, inline]);

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
            onOpenChange={changeOpen}
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
            <OverlayBackDismiss open={popoverVisible} onDismiss={() => changeOpen(false)} />
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
