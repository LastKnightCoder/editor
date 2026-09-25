import React, {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useMemo,
} from "react";
import { useMemoizedFn } from "ahooks";
import { Button, Upload, message, Dropdown, Tooltip, Input, Popover } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import {
  PictureOutlined,
  FilePdfOutlined,
  WechatWorkOutlined,
  SettingOutlined,
  SendOutlined,
  CloseOutlined,
  StopOutlined,
  CheckOutlined,
  ApiOutlined,
} from "@ant-design/icons";
import classnames from "classnames";
import { v4 as uuid } from "uuid";
import { LuBrain } from "react-icons/lu";
import PortalToBody from "../PortalToBody";
import ContextUsageIndicator from "./ContextUsageIndicator";
import {
  extractMentionRefsFromText,
  findActiveMentionQuery,
  serializeMentionRef,
} from "../../utils/chat-mentions";
import {
  DEFAULT_CHAT_INPUT_PLACEHOLDER,
  resolveChatInputPlaceholder,
} from "../../utils/chat-input-placeholder";
import "./index.less";
import type {
  ChatInputAreaHandle,
  ChatInputAreaProps,
  ReasoningEffort,
  MessageContentItem,
  MentionRef,
} from "./types";

export type {
  ChatInputAreaHandle,
  ChatInputAreaProps,
  ChatInputAreaServices,
  ReasoningEffort,
  MessageContentItem,
  MentionEntityType,
  MentionRef,
} from "./types";
export {
  ContextUsageIndicator,
  getContextUsageSummary,
  formatTokenCount,
} from "./ContextUsageIndicator";
export type { ChatContextUsage } from "./types";

const { TextArea } = Input;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface ReasoningEffortOption {
  value: ReasoningEffort;
  label: string;
  description: string;
}

const REASONING_EFFORT_OPTIONS: ReasoningEffortOption[] = [
  {
    value: "none",
    label: "立答如流",
    description: "关闭思考以提升响应速度",
  },
  {
    value: "low",
    label: "略作沉吟",
    description: "轻量推理，少量思考即可作答",
  },
  {
    value: "medium",
    label: "细致推演",
    description: "平衡速度与质量，保持稳健分析",
  },
  {
    value: "high",
    label: "穷尽求索",
    description: "深度推理，适合复杂任务",
  },
  {
    value: "xhigh",
    label: "远谋深算",
    description: "长程推演，适合复杂代理任务",
  },
  {
    value: "max",
    label: "极尽推演",
    description: "使用模型允许的最高推理强度",
  },
];

const DEFAULT_REASONING_EFFORT_OPTIONS: readonly ReasoningEffort[] = [
  "none",
  "low",
  "medium",
  "high",
];

interface ChatImageItem {
  id: string;
  previewUrl: string;
  path: string;
}

interface ChatFileItem {
  id: string;
  name: string;
  path: string;
}

interface NewChatTooltipStateOptions {
  createMessageLoading: boolean;
  sendLoading: boolean;
  contentEditable: boolean;
}

interface NewChatTooltipOpenOptions extends NewChatTooltipStateOptions {
  requestedOpen: boolean;
  reopenLocked: boolean;
}

interface MentionQueryState {
  query: string;
  start: number;
  end: number;
}

export const resolveNewChatTooltipOpen = ({
  requestedOpen,
  createMessageLoading,
  sendLoading,
  contentEditable,
  reopenLocked,
}: NewChatTooltipOpenOptions) =>
  requestedOpen && !createMessageLoading && !sendLoading && contentEditable && !reopenLocked;

export const shouldCloseNewChatTooltip = ({
  createMessageLoading,
  sendLoading,
  contentEditable,
}: NewChatTooltipStateOptions) => createMessageLoading || sendLoading || !contentEditable;

const ChatInputArea = forwardRef<ChatInputAreaHandle, ChatInputAreaProps>(
  (
    {
      services,
      className,
      contentEditable = true,
      onPressEnter,
      onStop,
      placeholder = DEFAULT_CHAT_INPUT_PLACEHOLDER,
      sendLoading = false,
      allowSendWhileLoading = false,
      queuedMessageCount = 0,
      createMessageLoading = false,
      onCreateNewMessage,
      modelSelectItems = [],
      onModelSelect,
      currentModelName,
      contextWindowK,
      contextUsage,
      isSupportImage = false,
      isSupportFile = false,
      reasoningEffort,
      reasoningEffortOptions,
      onReasoningEffortChange,
      reasoningEffortDisabled = false,
      onMcpManagerClick,
      extraToolbarButtons,
    },
    ref
  ) => {
    const resolvedPlaceholder = useMemo(
      () => resolveChatInputPlaceholder(placeholder),
      [placeholder]
    );
    const { uploadFile, convertFileSrc, getHomeDir } = services;

    const [textContent, setTextContent] = useState("");
    const [images, setImages] = useState<ChatImageItem[]>([]);
    const [files, setFiles] = useState<ChatFileItem[]>([]);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadingPdf, setUploadingPdf] = useState(false);
    const [mentionCandidates, setMentionCandidates] = useState<MentionRef[]>([]);
    const [mentionPanelOpen, setMentionPanelOpen] = useState(false);
    const [mentionPanelLoading, setMentionPanelLoading] = useState(false);
    const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
    const [mentionQueryState, setMentionQueryState] = useState<MentionQueryState | null>(null);
    const [isNewChatTooltipOpen, setIsNewChatTooltipOpen] = useState(false);
    const [isNewChatTooltipReopenLocked, setIsNewChatTooltipReopenLocked] = useState(false);
    const mentionRequestSeqRef = useRef(0);
    const composerMentions = useMemo(() => extractMentionRefsFromText(textContent), [textContent]);
    const showReasoningEffortControl =
      typeof reasoningEffort !== "undefined" && typeof onReasoningEffortChange === "function";
    const availableReasoningEffortOptions = REASONING_EFFORT_OPTIONS.filter(option =>
      (reasoningEffortOptions ?? DEFAULT_REASONING_EFFORT_OPTIONS).includes(option.value)
    );
    const currentReasoningOption = availableReasoningEffortOptions.find(
      option => option.value === reasoningEffort
    );
    const reasoningEffortMenuItems = useMemo(
      () =>
        availableReasoningEffortOptions.map(option => ({
          key: option.value,
          label: (
            <div
              className={classnames("flex min-w-[180px] items-center justify-between gap-3", {
                "text-blue-600": option.value === reasoningEffort,
              })}
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-xs text-gray-500">{option.description}</span>
              </div>
              {option.value === reasoningEffort && <CheckOutlined className="text-blue-500" />}
            </div>
          ),
        })),
      [availableReasoningEffortOptions, reasoningEffort]
    );
    const reasoningControlDisabled = reasoningEffortDisabled || sendLoading || !contentEditable;

    useEffect(() => {
      if (
        shouldCloseNewChatTooltip({
          createMessageLoading,
          sendLoading,
          contentEditable,
        })
      ) {
        setIsNewChatTooltipOpen(false);
      }
    }, [contentEditable, createMessageLoading, sendLoading]);

    useEffect(() => {
      if (!contentEditable || !services.searchMentionRefs || !mentionQueryState) {
        setMentionPanelOpen(false);
        setMentionPanelLoading(false);
        setMentionCandidates([]);
        return;
      }

      const requestSeq = ++mentionRequestSeqRef.current;
      const timer = window.setTimeout(async () => {
        setMentionPanelLoading(true);
        try {
          const results = await services.searchMentionRefs!(mentionQueryState.query);
          if (mentionRequestSeqRef.current !== requestSeq) {
            return;
          }
          setMentionCandidates(results);
          setMentionActiveIndex(0);
          setMentionPanelOpen(true);
        } catch (error) {
          console.error("搜索 mention 失败:", error);
          if (mentionRequestSeqRef.current === requestSeq) {
            setMentionCandidates([]);
            setMentionPanelOpen(true);
          }
        } finally {
          if (mentionRequestSeqRef.current === requestSeq) {
            setMentionPanelLoading(false);
          }
        }
      }, 150);

      return () => {
        window.clearTimeout(timer);
      };
    }, [contentEditable, mentionQueryState, services]);

    const resolveAbsolutePath = useMemoizedFn(async (path: string) => {
      if (path.startsWith("~")) {
        const homeDir = await getHomeDir();
        return `${homeDir}${path.slice(1)}`;
      }
      return path;
    });

    const getPreviewUrlFromPath = useMemoizedFn(async (path: string) => {
      if (/^(https?|data):/i.test(path)) {
        return path;
      }
      const absolutePath = await resolveAbsolutePath(path);
      return await convertFileSrc(absolutePath);
    });

    const appendImageAttachment = useMemoizedFn(
      async (attachment: { name: string; path: string }) => {
        let previewUrl = attachment.path;
        try {
          previewUrl = await getPreviewUrlFromPath(attachment.path);
        } catch (error) {
          console.error("生成图片预览失败:", error);
        }
        const imageItem: ChatImageItem = {
          id: uuid(),
          previewUrl,
          path: attachment.path,
        };
        setImages(prev => [...prev, imageItem]);
      }
    );

    const appendFileAttachment = useMemoizedFn((attachment: { name: string; path: string }) => {
      const fileItem: ChatFileItem = {
        id: uuid(),
        name: attachment.name,
        path: attachment.path,
      };
      setFiles(prev => [...prev, fileItem]);
    });

    const textAreaRef = useRef<TextAreaRef>(null);
    const closeMentionPanel = useMemoizedFn(() => {
      setMentionPanelOpen(false);
      setMentionPanelLoading(false);
      setMentionCandidates([]);
      setMentionActiveIndex(0);
      setMentionQueryState(null);
    });

    const syncMentionStateFromText = useMemoizedFn(
      (nextText: string, selectionStart: number | null | undefined) => {
        if (!contentEditable || !services.searchMentionRefs || typeof selectionStart !== "number") {
          closeMentionPanel();
          return;
        }

        const nextMentionQueryState = findActiveMentionQuery(nextText, selectionStart);
        if (!nextMentionQueryState) {
          closeMentionPanel();
          return;
        }

        setMentionQueryState(nextMentionQueryState);
      }
    );

    const insertMentionAtCursor = useMemoizedFn((mention: MentionRef) => {
      if (!mentionQueryState) {
        return;
      }
      const markup = serializeMentionRef(mention);
      const nextText = `${textContent.slice(0, mentionQueryState.start)}${markup} ${textContent.slice(mentionQueryState.end)}`;
      const nextCursor = mentionQueryState.start + markup.length + 1;

      setTextContent(nextText);
      closeMentionPanel();

      setTimeout(() => {
        const textArea = textAreaRef.current?.resizableTextArea?.textArea as
          HTMLTextAreaElement | undefined;
        if (!textArea) {
          return;
        }
        textArea.focus();
        textArea.setSelectionRange(nextCursor, nextCursor);
      }, 0);
    });

    const removeMentionMarkup = useMemoizedFn((mention: MentionRef) => {
      const markup = serializeMentionRef(mention);
      setTextContent(prev => {
        const index = prev.indexOf(markup);
        if (index < 0) {
          return prev;
        }

        const nextText = `${prev.slice(0, index)}${prev.slice(index + markup.length)}`
          .replace(/[ \t]{2,}/g, " ")
          .replace(/\n{3,}/g, "\n\n");
        return nextText.trimStart();
      });
    });

    useImperativeHandle(ref, () => ({
      getValue: (): MessageContentItem[] => {
        const content: MessageContentItem[] = [];

        images.forEach(image => {
          content.push({
            type: "image",
            image: image.previewUrl,
            path: image.path,
          });
        });

        files.forEach(file => {
          content.push({
            type: "file",
            file: file.path,
            fileName: file.name,
          });
        });

        if (textContent.trim()) {
          content.push({
            type: "text",
            text: textContent.trim(),
            mentions: extractMentionRefsFromText(textContent),
          });
        }

        return content;
      },
      clear: () => {
        setTextContent("");
        setImages([]);
        setFiles([]);
        closeMentionPanel();
      },
      setValue: (content: string) => {
        setTextContent(content);
        closeMentionPanel();
      },
      focusEnd: () => {
        if (textAreaRef.current?.resizableTextArea?.textArea) {
          const textArea = textAreaRef.current.resizableTextArea.textArea as HTMLTextAreaElement;
          textArea.focus();
          const length = textContent.length;
          textArea.setSelectionRange(length, length);
        }
      },
    }));

    const handleImageUpload = async (file: File) => {
      try {
        setUploadingImage(true);
        const uploadedPath = await uploadFile(file);
        if (!uploadedPath) {
          message.error("图片上传失败");
          return false;
        }
        const attachment = { name: file.name, path: uploadedPath };
        await appendImageAttachment(attachment);
        message.success("图片上传成功");
      } catch (error) {
        console.error("图片上传失败:", error);
        message.error("图片上传失败");
      } finally {
        setUploadingImage(false);
      }
      return false;
    };

    const handlePdfUpload = async (file: File) => {
      if (file.type.toLowerCase() !== "application/pdf") {
        message.error("仅支持 PDF 文件");
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        message.error("PDF 文件需小于 50MB");
        return false;
      }

      try {
        setUploadingPdf(true);
        const uploadedPath = await uploadFile(file);
        if (!uploadedPath) {
          message.error("PDF 上传失败");
          return false;
        }
        const attachment = { name: file.name, path: uploadedPath };
        appendFileAttachment(attachment);
        message.success("PDF 上传成功");
      } catch (error) {
        console.error("PDF 上传失败:", error);
        message.error("PDF 上传失败");
      } finally {
        setUploadingPdf(false);
      }
      return false;
    };

    const handlePaste = useMemoizedFn((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (sendLoading) return;
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const imageItems = isSupportImage
        ? Array.from(clipboardData.items).filter(
            item => item.kind === "file" && item.type.startsWith("image/")
          )
        : [];
      const pdfItems = isSupportFile
        ? Array.from(clipboardData.items).filter(
            item => item.kind === "file" && item.type.toLowerCase() === "application/pdf"
          )
        : [];

      if (imageItems.length === 0 && pdfItems.length === 0) return;

      void (async () => {
        if (isSupportImage) {
          for (const item of imageItems) {
            const file = item.getAsFile();
            if (!file) continue;
            await handleImageUpload(file);
          }
        }

        if (isSupportFile) {
          for (const item of pdfItems) {
            const file = item.getAsFile();
            if (!file) continue;
            await handlePdfUpload(file);
          }
        }
      })();
    });

    const removeImage = useMemoizedFn((imageId: string) => {
      setImages(prev => {
        return prev.filter(image => image.id !== imageId);
      });
    });

    const removeFile = useMemoizedFn((fileId: string) => {
      setFiles(prev => {
        return prev.filter(file => file.id !== fileId);
      });
    });

    const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent) => {
      if (mentionPanelOpen) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionActiveIndex(prev =>
            mentionCandidates.length === 0 ? 0 : (prev + 1) % mentionCandidates.length
          );
          return;
        }

        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionActiveIndex(prev =>
            mentionCandidates.length === 0
              ? 0
              : (prev + mentionCandidates.length - 1) % mentionCandidates.length
          );
          return;
        }

        if (e.key === "Escape") {
          e.preventDefault();
          closeMentionPanel();
          return;
        }

        if (e.key === "Enter" && !e.shiftKey && mentionCandidates.length > 0) {
          e.preventDefault();
          insertMentionAtCursor(mentionCandidates[mentionActiveIndex]!);
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onPressEnter?.();
      }
    });

    const handleCreateNewMessageClick = useMemoizedFn(() => {
      setIsNewChatTooltipOpen(false);
      setIsNewChatTooltipReopenLocked(true);
      onCreateNewMessage?.();
    });

    const handleNewChatTooltipMouseLeave = useMemoizedFn(() => {
      setIsNewChatTooltipOpen(false);
      setIsNewChatTooltipReopenLocked(false);
    });

    return (
      <div className={classnames("flex flex-col p-2", className)}>
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((image, index) => (
              <div key={image.id} className="group/image relative h-12 w-12">
                <img
                  src={image.previewUrl}
                  alt={`预览 ${index + 1}`}
                  className="h-12 w-12 cursor-zoom-in rounded-lg border border-gray-200 object-cover"
                  onClick={() => setPreviewImage(image.previewUrl)}
                />
                <CloseOutlined
                  className="text-white! hover:bg-gray-500! absolute right-1 top-1 h-4 w-4 cursor-pointer rounded-full p-1 opacity-0 transition-opacity duration-200 group-hover/image:opacity-100"
                  onClick={() => removeImage(image.id)}
                />
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <div className="mb-2 flex flex-col gap-2">
            {files.map(file => (
              <div
                key={file.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-zinc-800"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <FilePdfOutlined className="shrink-0 text-red-500" />
                  <span className="truncate text-sm text-gray-800 dark:text-gray-100">
                    {file.name}
                  </span>
                </div>
                <CloseOutlined
                  className="h-4 w-4 cursor-pointer text-gray-400 hover:text-gray-700"
                  onClick={() => removeFile(file.id)}
                />
              </div>
            ))}
          </div>
        )}

        {composerMentions.length > 0 && (
          <div className="mb-2 flex flex-col gap-2">
            {composerMentions.map((mention, index) => (
              <Popover
                key={`${mention.entityType}-${mention.entityId}-${mention.contentId}-${index}`}
                trigger={["hover", "click"]}
                placement="topLeft"
                content={
                  <div className="max-w-[320px] text-sm leading-6">
                    <div className="font-medium text-gray-900">{mention.title}</div>
                    <div className="mt-1 whitespace-pre-wrap text-gray-600">
                      {mention.previewText || "暂无摘要"}
                    </div>
                  </div>
                }
              >
                <div className="group flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-left dark:border-blue-500/20 dark:bg-blue-500/10">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-blue-700 dark:text-blue-200">
                      @{mention.title}
                    </div>
                    <div className="truncate text-xs text-blue-600/80 dark:text-blue-200/70">
                      {mention.previewText || "暂无摘要"}
                    </div>
                  </div>
                  <CloseOutlined
                    className="mt-0.5 text-xs text-blue-500/70 opacity-0 transition-opacity group-hover:opacity-100 dark:text-blue-200/70"
                    onClick={event => {
                      event.stopPropagation();
                      removeMentionMarkup(mention);
                    }}
                  />
                </div>
              </Popover>
            ))}
          </div>
        )}

        <div className="mb-2">
          <TextArea
            ref={textAreaRef}
            value={textContent}
            onChange={e => {
              setTextContent(e.target.value);
              syncMentionStateFromText(
                e.target.value,
                e.target.selectionStart ?? e.target.value.length
              );
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={() => {
              window.setTimeout(() => {
                closeMentionPanel();
              }, 120);
            }}
            placeholder={resolvedPlaceholder}
            autoSize={{ minRows: 1, maxRows: 6 }}
            disabled={!contentEditable}
            className="px-0! dark:text-[#e6edf3]! w-full resize-none border-none bg-transparent text-base focus:border-blue-400 focus:ring-0"
            classNames={{
              textarea: "shared-chat-input-textarea",
            }}
            variant="borderless"
          />
          {mentionPanelOpen && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-zinc-900">
              {mentionPanelLoading ? (
                <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                  正在搜索引用...
                </div>
              ) : mentionCandidates.length > 0 ? (
                mentionCandidates.map((mention, index) => (
                  <button
                    key={`${mention.entityType}-${mention.entityId}-${mention.contentId}`}
                    type="button"
                    className={classnames(
                      "flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition-colors",
                      index === mentionActiveIndex
                        ? "bg-blue-50 dark:bg-blue-500/10"
                        : "hover:bg-gray-50 dark:hover:bg-white/5"
                    )}
                    onMouseDown={event => {
                      event.preventDefault();
                      insertMentionAtCursor(mention);
                    }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {mention.title}
                      </div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {mention.previewText || "暂无摘要"}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-white/5 dark:text-gray-400">
                      {mention.entityType}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                  没有找到相关内容
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {onCreateNewMessage && (
              <Tooltip
                title="新建对话"
                trigger={["hover"]}
                open={isNewChatTooltipOpen}
                destroyOnHidden
                onOpenChange={open => {
                  setIsNewChatTooltipOpen(
                    resolveNewChatTooltipOpen({
                      requestedOpen: open,
                      createMessageLoading,
                      sendLoading,
                      contentEditable,
                      reopenLocked: isNewChatTooltipReopenLocked,
                    })
                  );
                }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<WechatWorkOutlined />}
                  onMouseDown={() => {
                    setIsNewChatTooltipOpen(false);
                    setIsNewChatTooltipReopenLocked(true);
                  }}
                  onMouseLeave={handleNewChatTooltipMouseLeave}
                  onClick={handleCreateNewMessageClick}
                  loading={createMessageLoading}
                  disabled={sendLoading}
                  className="p-1! bg-none! border-none! hover:!bg-gray-100! dark:hover:!bg-white/10! text-gray-600! dark:text-gray-400!"
                />
              </Tooltip>
            )}

            {modelSelectItems.length > 0 && onModelSelect && (
              <Dropdown
                menu={{
                  items: modelSelectItems,
                  onClick: onModelSelect,
                }}
                trigger={["click"]}
                disabled={sendLoading}
              >
                <Tooltip title={currentModelName || "选择模型"}>
                  <Button
                    type="text"
                    size="small"
                    icon={<SettingOutlined />}
                    disabled={sendLoading}
                    className="p-1! bg-none! border-none! hover:!bg-gray-100! dark:hover:!bg-white/10! text-gray-600! dark:text-gray-400!"
                  />
                </Tooltip>
              </Dropdown>
            )}
            {showReasoningEffortControl && (
              <Dropdown
                menu={{
                  items: reasoningEffortMenuItems,
                  onClick: ({ key }) => onReasoningEffortChange?.(key as ReasoningEffort),
                }}
                trigger={["click"]}
                disabled={reasoningControlDisabled}
              >
                <span
                  style={{
                    display: "inline-block",
                    cursor: reasoningControlDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  <Button
                    type="text"
                    size="small"
                    disabled={reasoningControlDisabled}
                    className="p-1! bg-none! border-none! hover:!bg-gray-100! dark:hover:!bg-white/10! text-gray-600! dark:text-gray-400! flex items-center gap-1.5"
                    style={{
                      pointerEvents: reasoningControlDisabled ? "none" : "auto",
                    }}
                  >
                    <LuBrain className="text-base" />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      {currentReasoningOption?.label ?? "立答如流"}
                    </span>
                  </Button>
                </span>
              </Dropdown>
            )}
            {onMcpManagerClick && (
              <Tooltip title="MCP 管理中心">
                <Button
                  type="text"
                  size="small"
                  icon={<ApiOutlined />}
                  disabled={sendLoading}
                  className="p-1! bg-none! border-none! hover:!bg-gray-100! dark:hover:!bg-white/10! text-gray-600! dark:text-gray-400!"
                  onClick={onMcpManagerClick}
                />
              </Tooltip>
            )}
            <ContextUsageIndicator contextWindowK={contextWindowK} usage={contextUsage} />
            {isSupportImage && (
              <Tooltip title="上传图片">
                <Upload
                  accept="image/png, image/jpeg, image/webp"
                  showUploadList={false}
                  beforeUpload={handleImageUpload}
                  disabled={!contentEditable || sendLoading || uploadingImage}
                >
                  <Button
                    type="text"
                    icon={<PictureOutlined />}
                    size="small"
                    disabled={!contentEditable || sendLoading || uploadingImage}
                    loading={uploadingImage}
                    className="p-1! rounded! bg-none! border-none! hover:!bg-gray-100! dark:hover:!bg-white/10! text-gray-600! dark:text-gray-400!"
                  />
                </Upload>
              </Tooltip>
            )}
            {isSupportFile && (
              <Tooltip title="上传 PDF">
                <Upload
                  accept="application/pdf"
                  showUploadList={false}
                  beforeUpload={handlePdfUpload}
                  disabled={!contentEditable || sendLoading || uploadingPdf}
                >
                  <Button
                    type="text"
                    icon={<FilePdfOutlined />}
                    size="small"
                    disabled={!contentEditable || sendLoading || uploadingPdf}
                    loading={uploadingPdf}
                    className="p-1! rounded! bg-none! border-none! hover:!bg-gray-100! dark:hover:!bg-white/10! text-gray-600! dark:text-gray-400!"
                  />
                </Upload>
              </Tooltip>
            )}
            {extraToolbarButtons}
          </div>

          <div className="flex items-center gap-1">
            {sendLoading && (
              <Button
                type="text"
                size="small"
                onClick={onStop}
                icon={<StopOutlined />}
                className="border-none! bg-none! text-gray-600! dark:text-gray-400! hover:text-red-500! hover:bg-red-50! dark:hover:bg-red-900/20! shadow-none! rounded p-1"
                title="停止生成"
              />
            )}
            {(!sendLoading || allowSendWhileLoading) && (
              <span className="relative inline-flex">
                <Button
                  type="text"
                  size="small"
                  onClick={onPressEnter}
                  icon={<SendOutlined />}
                  className="border-none! bg-none! hover:!bg-gray-100! dark:hover:!bg-white/10! text-gray-600! dark:text-gray-400! shadow-none! rounded p-1"
                  title={sendLoading ? "加入发送队列" : "发送"}
                />
                {queuedMessageCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-blue-500 px-1 text-center text-[10px] leading-4 text-white">
                    {queuedMessageCount}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <PortalToBody>
          {previewImage && (
            <div
              className="fixed inset-0 flex cursor-zoom-out items-center justify-center bg-black bg-opacity-50"
              style={{ zIndex: 9999 }}
              onClick={() => setPreviewImage(null)}
            >
              <div className="-z-1 absolute inset-0 bg-black bg-opacity-50" />
              <img src={previewImage} alt="预览" className="max-h-full max-w-full" />
              <CloseOutlined
                className="text-white! hover:bg-gray-500! absolute right-4 top-4 h-5 w-5 cursor-pointer rounded-full p-1 duration-200"
                onClick={() => setPreviewImage(null)}
              />
            </div>
          )}
        </PortalToBody>
      </div>
    );
  }
);

ChatInputArea.displayName = "ChatInputArea";

export default ChatInputArea;
