import React, {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useMemo,
} from "react";
import { useMemoizedFn } from "ahooks";
import { IconButton, ImagePreview, Menu, Popover, Tooltip, cn, toast } from "@tau/ui";
import {
  ArrowUp,
  AtSign,
  Brain,
  FileText,
  ImagePlus,
  Plug,
  Square,
  SquarePen,
  X,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import {
  ChipCaret,
  ComposerAddMenu,
  ComposerPanel,
  ComposerPanelItem,
  ContextUsageRing,
  ToolbarChip,
  type ComposerAddItem,
} from "../ChatComposer";
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
export type { ChatContextUsage, ChatDropdownItem } from "./types";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface ThinkingLevelOption {
  value: ThinkingLevel;
  label: string;
  /** 侧边栏宽度有限，工具行上显示两字短名 */
  short: string;
  description: string;
}

/** 全部档位的文案；实际可选项由模型能力决定（thinkingLevelOptions） */
const THINKING_LEVEL_OPTIONS: ThinkingLevelOption[] = [
  {
    value: "off",
    label: "立答如流",
    short: "立答",
    description: "关闭思考以提升响应速度",
  },
  {
    value: "minimal",
    label: "极简思考",
    short: "极简",
    description: "只做最低限度的思考",
  },
  {
    value: "low",
    label: "略作沉吟",
    short: "略思",
    description: "轻量推理，少量思考即可作答",
  },
  {
    value: "medium",
    label: "细致推演",
    short: "细致",
    description: "平衡速度与质量，保持稳健分析",
  },
  {
    value: "high",
    label: "穷尽求索",
    short: "穷尽",
    description: "深度推理，适合复杂任务",
  },
  {
    value: "xhigh",
    label: "远谋深算",
    short: "远谋",
    description: "长程推演，适合复杂代理任务",
  },
  {
    value: "max",
    label: "极尽推演",
    short: "极尽",
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

interface MentionQueryState {
  query: string;
  start: number;
  end: number;
}

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
      currentModelKey,
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
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadingPdf, setUploadingPdf] = useState(false);
    const [mentionCandidates, setMentionCandidates] = useState<MentionRef[]>([]);
    const [mentionPanelOpen, setMentionPanelOpen] = useState(false);
    const [mentionPanelLoading, setMentionPanelLoading] = useState(false);
    const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
    const [mentionQueryState, setMentionQueryState] = useState<MentionQueryState | null>(null);
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

    // 等同于在光标处输入 @：交给 @ 引用面板
    const insertMentionTrigger = useMemoizedFn(() => {
      const textArea = textAreaRef.current;
      if (!textArea) return;
      const cursor = textArea.selectionStart ?? textContent.length;
      const nextText = `${textContent.slice(0, cursor)}@${textContent.slice(cursor)}`;
      setTextContent(nextText);
      syncMentionStateFromText(nextText, cursor + 1);
      window.requestAnimationFrame(() => {
        textArea.focus();
        textArea.setSelectionRange(cursor + 1, cursor + 1);
      });
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

        if (e.key === "Enter" && !e.nativeEvent.isComposing && mentionCandidates.length > 0) {
          e.preventDefault();
          insertMentionAtCursor(mentionCandidates[mentionActiveIndex]!);
          return;
        }
      }

      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
        e.preventDefault();
        onPressEnter?.();
      }
    });

    const attachDisabled = !contentEditable || sendLoading;
    const addItems: ComposerAddItem[] = [
      ...(isSupportImage
        ? [
            {
              key: "image",
              group: "添加",
              icon: <ImagePlus />,
              label: "图片",
              description: "PNG / JPG / WebP，也可直接粘贴",
              disabled: attachDisabled || uploadingImage,
              onSelect: () => imageFileInputRef.current?.click(),
            },
          ]
        : []),
      ...(isSupportFile
        ? [
            {
              key: "file",
              group: "添加",
              icon: <FileText />,
              label: "PDF",
              description: "小于 50MB",
              disabled: attachDisabled || uploadingPdf,
              onSelect: () => pdfFileInputRef.current?.click(),
            },
          ]
        : []),
      ...(services.searchMentionRefs
        ? [
            {
              key: "mention",
              group: "添加",
              icon: <AtSign />,
              label: "引用内容",
              description: "卡片、文章、项目文档",
              kbd: "@",
              disabled: !contentEditable,
              onSelect: insertMentionTrigger,
            },
          ]
        : []),
      ...(onCreateNewMessage
        ? [
            {
              key: "new-chat",
              group: "对话",
              icon: <SquarePen />,
              label: "新建对话",
              description: "当前对话保留在会话列表里",
              disabled: createMessageLoading,
              onSelect: onCreateNewMessage,
            },
          ]
        : []),
      ...(onMcpManagerClick
        ? [
            {
              key: "mcp",
              group: "工具",
              icon: <Plug />,
              label: "MCP 管理中心",
              description: "在桌面端打开",
              disabled: sendLoading,
              onSelect: onMcpManagerClick,
            },
          ]
        : []),
    ];

    const hasText = textContent.trim().length > 0;
    const canSend =
      (hasText || images.length > 0 || files.length > 0) && (!sendLoading || allowSendWhileLoading);

    const modelMenu =
      modelSelectItems.length > 0 && onModelSelect ? (
        <Menu
          align="end"
          className="w-[260px]"
          trigger={
            <ToolbarChip
              disabled={sendLoading}
              title={currentModelName || "选择模型"}
              className="max-w-[160px] shrink"
            >
              <span className="min-w-0 truncate font-medium">{currentModelName || "选择模型"}</span>
              <ChipCaret />
            </ToolbarChip>
          }
        >
          <Menu.RadioGroup value={currentModelKey} onValueChange={key => onModelSelect({ key })}>
            {modelSelectItems.map((item, index) =>
              item.group ? (
                <div key={item.key}>
                  {index > 0 && <Menu.Separator />}
                  <Menu.Group>{item.label}</Menu.Group>
                </div>
              ) : (
                <Menu.RadioItem key={item.key} value={item.key} disabled={item.disabled}>
                  <span className="truncate">{item.label}</span>
                </Menu.RadioItem>
              )
            )}
          </Menu.RadioGroup>
        </Menu>
      ) : null;

    const thinkingMenu = showThinkingLevelControl ? (
      <Menu
        align="end"
        // 双行选项超出 Menu 默认 300px 上限；选项数固定，放开高度免出滚动条
        className="max-h-none w-[240px]"
        trigger={
          <ToolbarChip disabled={thinkingControlDisabled} title="思考强度">
            <Brain size={15} strokeWidth={1.75} className="text-ink-2" />
            <span className="min-w-0 truncate">{currentThinkingOption?.short ?? "立答"}</span>
            <ChipCaret />
          </ToolbarChip>
        }
      >
        <Menu.Group>思考强度</Menu.Group>
        <Menu.RadioGroup
          value={thinkingLevel}
          onValueChange={value => onThinkingLevelChange?.(value as ThinkingLevel)}
        >
          {availableThinkingLevelOptions.map(option => (
            <Menu.RadioItem key={option.value} value={option.value} className="h-auto py-1.5">
              <span className="flex min-w-0 flex-col">
                <span>{option.label}</span>
                <span className="text-tau-tiny text-ink-3 truncate">{option.description}</span>
              </span>
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu>
    ) : null;

    return (
      <div className={cn("flex flex-col", className)}>
        {(images.length > 0 || files.length > 0) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((image, index) => (
              <div key={image.id} className="group/att relative size-14">
                <img
                  src={image.previewUrl}
                  alt={`预览 ${index + 1}`}
                  className="border-line-1 rounded-tau-sm size-14 cursor-zoom-in border object-cover"
                  onClick={() => setPreviewIndex(index)}
                />
                <button
                  type="button"
                  aria-label="移除图片"
                  onClick={() => removeImage(image.id)}
                  className="bg-ink-1/70 text-ink-inverse absolute -right-1.5 -top-1.5 grid size-[18px] place-items-center rounded-full opacity-0 transition-opacity group-hover/att:opacity-100"
                >
                  <X size={11} strokeWidth={2.25} />
                </button>
              </div>
            ))}
            {files.map(file => (
              <div
                key={file.id}
                className="border-line-1 bg-surface group/att rounded-tau-sm flex h-8 max-w-[240px] items-center gap-1.5 border pl-2 pr-1"
              >
                <FileText size={14} strokeWidth={1.75} className="text-danger shrink-0" />
                <span className="text-tau-sm text-ink-1 min-w-0 truncate">{file.name}</span>
                <IconButton
                  aria-label="移除文件"
                  className="size-5 [&_svg]:size-3"
                  onClick={() => removeFile(file.id)}
                >
                  <X strokeWidth={2} />
                </IconButton>
              </div>
            ))}
          </div>
        )}

        {composerMentions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {composerMentions.map((mention, index) => (
              <Popover
                key={`${mention.entityType}-${mention.entityId}-${mention.contentId}-${index}`}
                placement="top-start"
                trigger={
                  <div className="bg-accent-soft text-accent-text rounded-tau-sm group flex h-7 max-w-[240px] items-center gap-1 pl-2 pr-1">
                    <span className="text-tau-sm min-w-0 truncate font-medium">
                      @{mention.title}
                    </span>
                    <button
                      type="button"
                      aria-label="移除引用"
                      className="grid size-4 shrink-0 place-items-center opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={event => {
                        event.stopPropagation();
                        removeMentionMarkup(mention);
                      }}
                    >
                      <X size={11} strokeWidth={2.25} />
                    </button>
                  </div>
                }
              >
                <Popover.Body>
                  <div className="text-tau-sm max-w-[320px] leading-6">
                    <div className="text-ink-1 font-medium">{mention.title}</div>
                    <div className="text-ink-2 mt-1 whitespace-pre-wrap">
                      {mention.previewText || "暂无摘要"}
                    </div>
                  </div>
                </Popover.Body>
              </Popover>
            ))}
          </div>
        )}

        <div className={cn("px-0.5", !contentEditable && "opacity-60")}>
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
            className="text-tau-body-lg text-ink-1 placeholder:text-ink-3 block w-full resize-none border-none bg-transparent p-0 focus:outline-none focus:ring-0"
          />
          {mentionPanelOpen && (
            <ComposerPanel className="mt-2">
              <div className="max-h-[280px] min-h-0 overflow-y-auto p-1.5">
                {mentionPanelLoading ? (
                  <div className="text-tau-sm text-ink-3 px-2.5 py-2">正在搜索引用...</div>
                ) : mentionCandidates.length > 0 ? (
                  mentionCandidates.map((mention, index) => (
                    <ComposerPanelItem
                      key={`${mention.entityType}-${mention.entityId}-${mention.contentId}`}
                      icon={<AtSign />}
                      label={mention.title}
                      description={mention.previewText || "暂无摘要"}
                      active={index === mentionActiveIndex}
                      onHover={() => setMentionActiveIndex(index)}
                      onSelect={() => insertMentionAtCursor(mention)}
                    />
                  ))
                ) : (
                  <div className="text-tau-sm text-ink-3 px-2.5 py-2">没有找到相关内容</div>
                )}
              </div>
            </ComposerPanel>
          )}
        </div>

        <div className="mt-2.5 flex items-center gap-1">
          <ComposerAddMenu
            items={addItems}
            busy={uploadingImage || uploadingPdf}
            disabled={!contentEditable}
          />
          {extraToolbarButtons}
          <span className="min-w-1 flex-1" />
          <ContextUsageRing contextWindowK={contextWindowK} usage={contextUsage} />
          {modelMenu}
          {thinkingMenu}
          {sendLoading && (
            <Tooltip content="停止生成" placement="top" delay={300}>
              <button
                type="button"
                aria-label="停止生成"
                onClick={onStop}
                className="bg-ink-1 text-surface ml-1 grid size-[30px] shrink-0 place-items-center rounded-[10px] hover:opacity-90"
              >
                <Square size={11} strokeWidth={0} fill="currentColor" />
              </button>
            </Tooltip>
          )}
          {(!sendLoading || allowSendWhileLoading) && (
            <Tooltip
              content={sendLoading ? "加入发送队列（⌘/Ctrl + Enter）" : "发送（⌘/Ctrl + Enter）"}
              placement="top"
              delay={300}
            >
              <button
                type="button"
                aria-label={sendLoading ? "加入发送队列" : "发送"}
                onClick={onPressEnter}
                disabled={!canSend}
                className={cn(
                  "ease-tau-out relative ml-1 grid size-[30px] shrink-0 place-items-center rounded-[10px] transition-[background,color] duration-[160ms]",
                  "bg-accent text-ink-inverse enabled:hover:bg-accent-hover disabled:bg-hover disabled:text-ink-3 disabled:cursor-default"
                )}
              >
                <ArrowUp size={16} strokeWidth={2.25} />
                {queuedMessageCount > 0 && (
                  <span className="bg-ink-1 text-ink-inverse absolute -right-1.5 -top-1.5 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold tabular-nums leading-4">
                    {queuedMessageCount}
                  </span>
                )}
              </button>
            </Tooltip>
          )}
        </div>

        {isSupportImage && (
          <input
            ref={imageFileInputRef}
            type="file"
            accept="image/png, image/jpeg, image/webp"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void handleImageUpload(file);
              event.target.value = "";
            }}
          />
        )}
        {isSupportFile && (
          <input
            ref={pdfFileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void handlePdfUpload(file);
              event.target.value = "";
            }}
          />
        )}

        <ImagePreview
          images={images.map((image, index) => ({
            src: image.previewUrl,
            alt: `预览 ${index + 1}`,
          }))}
          index={previewIndex ?? 0}
          onIndexChange={setPreviewIndex}
          open={previewIndex !== null}
          onOpenChange={open => !open && setPreviewIndex(null)}
        />
      </div>
    );
  }
);

ChatInputArea.displayName = "ChatInputArea";

export default ChatInputArea;
