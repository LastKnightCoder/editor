import React, {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useMemo,
} from "react";
import { useMemoizedFn } from "ahooks";
import { Menu, Popover, Tooltip, toast } from "@tau/ui";
import {
  Check,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquarePlus,
  Plug,
  Send,
  Settings,
  Square,
  X,
} from "lucide-react";
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
import type {
  ChatInputAreaHandle,
  ChatInputAreaProps,
  ThinkingLevel,
  MessageContentItem,
  MentionRef,
} from "./types";

export type {
  ChatInputAreaHandle,
  ChatInputAreaProps,
  ChatInputAreaServices,
  ThinkingLevel,
  MessageContentItem,
  MentionEntityType,
  MentionRef,
} from "./types";
export {
  ContextUsageIndicator,
  getContextUsageSummary,
  formatTokenCount,
} from "./ContextUsageIndicator";
export type { ChatContextUsage, ChatDropdownItem } from "./types";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface ThinkingLevelOption {
  value: ThinkingLevel;
  label: string;
  description: string;
}

/** 全部档位的文案；实际可选项由模型能力决定（thinkingLevelOptions） */
const THINKING_LEVEL_OPTIONS: ThinkingLevelOption[] = [
  {
    value: "off",
    label: "立答如流",
    description: "关闭思考以提升响应速度",
  },
  {
    value: "minimal",
    label: "极简思考",
    description: "只做最低限度的思考",
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

/** 调用方没给可选档位时的兜底（模型能力未知，只给各家都有的几档） */
const DEFAULT_THINKING_LEVEL_OPTIONS: readonly ThinkingLevel[] = ["off", "low", "medium", "high"];

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
      thinkingLevel,
      thinkingLevelOptions,
      onThinkingLevelChange,
      thinkingLevelDisabled = false,
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
    const showThinkingLevelControl =
      typeof thinkingLevel !== "undefined" && typeof onThinkingLevelChange === "function";
    const availableThinkingLevelOptions = THINKING_LEVEL_OPTIONS.filter(option =>
      (thinkingLevelOptions ?? DEFAULT_THINKING_LEVEL_OPTIONS).includes(option.value)
    );
    const currentThinkingOption = availableThinkingLevelOptions.find(
      option => option.value === thinkingLevel
    );
    const thinkingControlDisabled = thinkingLevelDisabled || sendLoading || !contentEditable;

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

    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const imageFileInputRef = useRef<HTMLInputElement>(null);
    const pdfFileInputRef = useRef<HTMLInputElement>(null);

    // 自增长高度：1 行起步、最多 6 行，超出转滚动（取代 antd TextArea 的 autoSize）
    useEffect(() => {
      const el = textAreaRef.current;
      if (!el) return;
      el.style.height = "auto";
      const lineHeight = Number.parseFloat(window.getComputedStyle(el).lineHeight) || 24;
      const maxHeight = lineHeight * 6;
      const next = Math.max(lineHeight, Math.min(el.scrollHeight, maxHeight));
      el.style.height = `${next}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
    }, [textContent]);
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
        const textArea = textAreaRef.current;
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
        if (textAreaRef.current) {
          const textArea = textAreaRef.current;
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
          toast.error("图片上传失败");
          return false;
        }
        const attachment = { name: file.name, path: uploadedPath };
        await appendImageAttachment(attachment);
        toast.success("图片上传成功");
      } catch (error) {
        console.error("图片上传失败:", error);
        toast.error("图片上传失败");
      } finally {
        setUploadingImage(false);
      }
      return false;
    };

    const handlePdfUpload = async (file: File) => {
      if (file.type.toLowerCase() !== "application/pdf") {
        toast.error("仅支持 PDF 文件");
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error("PDF 文件需小于 50MB");
        return false;
      }

      try {
        setUploadingPdf(true);
        const uploadedPath = await uploadFile(file);
        if (!uploadedPath) {
          toast.error("PDF 上传失败");
          return false;
        }
        const attachment = { name: file.name, path: uploadedPath };
        appendFileAttachment(attachment);
        toast.success("PDF 上传成功");
      } catch (error) {
        console.error("PDF 上传失败:", error);
        toast.error("PDF 上传失败");
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
                <X
                  size={12}
                  className="absolute right-1 top-1 cursor-pointer rounded-full bg-black/40 p-0.5 text-white opacity-0 transition-opacity duration-200 hover:bg-gray-500 group-hover/image:opacity-100"
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
                  <FileText size={14} className="shrink-0 text-red-500" />
                  <span className="truncate text-sm text-gray-800 dark:text-gray-100">
                    {file.name}
                  </span>
                </div>
                <X
                  size={14}
                  className="cursor-pointer text-gray-400 hover:text-gray-700"
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
                placement="top-start"
                trigger={
                  <div className="group flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-left dark:border-blue-500/20 dark:bg-blue-500/10">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-blue-700 dark:text-blue-200">
                        @{mention.title}
                      </div>
                      <div className="truncate text-xs text-blue-600/80 dark:text-blue-200/70">
                        {mention.previewText || "暂无摘要"}
                      </div>
                    </div>
                    <X
                      size={12}
                      className="mt-0.5 text-blue-500/70 opacity-0 transition-opacity group-hover:opacity-100 dark:text-blue-200/70"
                      onClick={event => {
                        event.stopPropagation();
                        removeMentionMarkup(mention);
                      }}
                    />
                  </div>
                }
              >
                <div className="max-w-[320px] p-2 text-sm leading-6">
                  <div className="font-medium text-gray-900">{mention.title}</div>
                  <div className="mt-1 whitespace-pre-wrap text-gray-600">
                    {mention.previewText || "暂无摘要"}
                  </div>
                </div>
              </Popover>
            ))}
          </div>
        )}

        <div className="mb-2">
          <textarea
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
            disabled={!contentEditable}
            rows={1}
            className="text-ink-1 placeholder:text-ink-3 w-full resize-none border-none bg-transparent px-0 text-base focus:outline-none focus:ring-0"
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
                content="新建对话"
                open={isNewChatTooltipOpen}
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
                <button
                  type="button"
                  onMouseDown={() => {
                    setIsNewChatTooltipOpen(false);
                    setIsNewChatTooltipReopenLocked(true);
                  }}
                  onMouseLeave={handleNewChatTooltipMouseLeave}
                  onClick={handleCreateNewMessageClick}
                  disabled={sendLoading || createMessageLoading}
                  className="flex cursor-pointer items-center rounded-md p-1 text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-default disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/10"
                >
                  {createMessageLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <MessageSquarePlus size={14} />
                  )}
                </button>
              </Tooltip>
            )}

            {modelSelectItems.length > 0 && onModelSelect && (
              <Menu
                align="start"
                trigger={
                  <button
                    type="button"
                    title={currentModelName || "选择模型"}
                    disabled={sendLoading}
                    className="flex cursor-pointer items-center rounded-md p-1 text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-default disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/10"
                  >
                    <Settings size={14} />
                  </button>
                }
              >
                {modelSelectItems.map(item =>
                  item.group ? (
                    <Menu.Group key={item.key}>{item.label}</Menu.Group>
                  ) : (
                    <Menu.Item
                      key={item.key}
                      disabled={item.disabled}
                      onSelect={() => onModelSelect?.({ key: item.key })}
                    >
                      {item.label}
                    </Menu.Item>
                  )
                )}
              </Menu>
            )}
            {showThinkingLevelControl && (
              <Menu
                align="start"
                trigger={
                  <button
                    type="button"
                    disabled={thinkingControlDisabled}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md p-1 text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-default disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/10"
                  >
                    <LuBrain className="text-base" />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      {currentThinkingOption?.label ?? "立答如流"}
                    </span>
                  </button>
                }
              >
                {availableThinkingLevelOptions.map(option => (
                  <Menu.Item
                    key={option.value}
                    onSelect={() => onThinkingLevelChange?.(option.value)}
                  >
                    <div
                      className={classnames(
                        "flex min-w-[180px] items-center justify-between gap-3",
                        { "text-blue-600": option.value === thinkingLevel }
                      )}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{option.label}</span>
                        <span className="text-xs text-gray-500">{option.description}</span>
                      </div>
                      {option.value === thinkingLevel && (
                        <Check size={14} className="text-blue-500" />
                      )}
                    </div>
                  </Menu.Item>
                ))}
              </Menu>
            )}
            {onMcpManagerClick && (
              <Tooltip content="MCP 管理中心">
                <button
                  type="button"
                  disabled={sendLoading}
                  onClick={onMcpManagerClick}
                  className="flex cursor-pointer items-center rounded-md p-1 text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-default disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/10"
                >
                  <Plug size={14} />
                </button>
              </Tooltip>
            )}
            <ContextUsageIndicator contextWindowK={contextWindowK} usage={contextUsage} />
            <input
              ref={imageFileInputRef}
              type="file"
              accept="image/png, image/jpeg, image/webp"
              className="hidden"
              disabled={!contentEditable || sendLoading || uploadingImage}
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) void handleImageUpload(file);
                event.target.value = "";
              }}
            />
            {isSupportImage && (
              <Tooltip content="上传图片">
                <button
                  type="button"
                  disabled={!contentEditable || sendLoading || uploadingImage}
                  onClick={() => imageFileInputRef.current?.click()}
                  className="flex cursor-pointer items-center rounded-md p-1 text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-default disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/10"
                >
                  {uploadingImage ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ImageIcon size={14} />
                  )}
                </button>
              </Tooltip>
            )}
            <input
              ref={pdfFileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={!contentEditable || sendLoading || uploadingPdf}
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) void handlePdfUpload(file);
                event.target.value = "";
              }}
            />
            {isSupportFile && (
              <Tooltip content="上传 PDF">
                <button
                  type="button"
                  disabled={!contentEditable || sendLoading || uploadingPdf}
                  onClick={() => pdfFileInputRef.current?.click()}
                  className="flex cursor-pointer items-center rounded-md p-1 text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-default disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/10"
                >
                  {uploadingPdf ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FileText size={14} />
                  )}
                </button>
              </Tooltip>
            )}
            {extraToolbarButtons}
          </div>

          <div className="flex items-center gap-1">
            {sendLoading && (
              <button
                type="button"
                onClick={onStop}
                title="停止生成"
                className="flex cursor-pointer items-center rounded p-1 text-gray-600 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-gray-400 dark:hover:bg-red-900/20"
              >
                <Square size={14} />
              </button>
            )}
            {(!sendLoading || allowSendWhileLoading) && (
              <span className="relative inline-flex">
                <button
                  type="button"
                  onClick={onPressEnter}
                  title={sendLoading ? "加入发送队列" : "发送"}
                  className="flex cursor-pointer items-center rounded p-1 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
                >
                  <Send size={14} />
                </button>
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
              <X
                size={16}
                className="absolute right-4 top-4 cursor-pointer rounded-full bg-black/40 p-1 text-white transition-colors duration-200 hover:bg-gray-500"
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
