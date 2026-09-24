import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Button, Dropdown, Tooltip, Upload, message } from "antd";
import type { MenuProps } from "antd";
import {
  ApiOutlined,
  CheckOutlined,
  CloseOutlined,
  DownOutlined,
  FilePdfOutlined,
  FolderOpenOutlined,
  PictureOutlined,
  SendOutlined,
  SettingOutlined,
  StopOutlined,
  WechatWorkOutlined,
} from "@ant-design/icons";
import classnames from "classnames";
import { v4 as uuid } from "uuid";
import { LuBrain } from "react-icons/lu";
import type { Descendant } from "slate";

import { Editor, type EditorRef, type IHotKeyConfig } from "@tau/editor/src";
import {
  DEFAULT_CHAT_INPUT_PLACEHOLDER,
  resolveNewChatTooltipOpen,
  resolveChatInputPlaceholder,
  shouldCloseNewChatTooltip,
  type ChatInputAreaHandle,
  type ChatInputAreaServices,
  type MentionEntityType,
  type MentionRef,
  type MessageContentItem,
  type ReasoningEffort,
  type ChatContextUsage,
  ContextUsageIndicator,
} from "@tau/shared";

import useUploadResource from "@/hooks/useUploadResource";
import { convertFileSrc, getHomeDir } from "@/commands";
import type { ChatAgentType } from "@/types";
import useMCPManagerModalStore from "@/stores/useMCPManagerModalStore";
import useTheme from "@/hooks/useTheme";
import { contentLinkExtension } from "@/editor-extensions";
import { wrapContentLink } from "@/editor-extensions/content-link/components/utils";
import { importFromMarkdown, getMarkdown } from "@/utils/markdown";
import styles from "./index.module.less";

export type { ChatInputAreaHandle };

interface ChatInputAreaProps {
  className?: string;
  contentEditable?: boolean;
  onPressEnter?: () => void;
  onStop?: () => void;
  placeholder?: string;
  sendLoading?: boolean;
  allowSendWhileLoading?: boolean;
  queuedMessageCount?: number;
  createMessageLoading?: boolean;
  onCreateNewMessage?: () => void;
  modelSelectItems?: MenuProps["items"];
  onModelSelect?: ({ key }: { key: string }) => void;
  currentModelName?: string;
  contextWindowK?: number;
  contextUsage?: ChatContextUsage | null;
  isSupportImage?: boolean;
  isSupportFile?: boolean;
  reasoningEffort?: ReasoningEffort;
  reasoningEffortOptions?: readonly ReasoningEffort[];
  onReasoningEffortChange?: (level: ReasoningEffort) => void;
  reasoningEffortDisabled?: boolean;
  showMcpManager?: boolean;
  agentType?: ChatAgentType;
  onAgentTypeChange?: (agentType: ChatAgentType) => void;
  agentTypeDisabled?: boolean;
  codexWorkingDirectory?: string | null;
  onSelectCodexWorkingDirectory?: () => void;
  onClearCodexWorkingDirectory?: () => void;
}

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

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const REASONING_EFFORT_OPTIONS: Array<{
  value: ReasoningEffort;
  label: string;
  description: string;
}> = [
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

const createEmptyEditorContent = (): Descendant[] => [
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  } as Descendant,
];

const extractMentionRefsFromEditorContent = (content: Descendant[]): MentionRef[] => {
  const mentions: MentionRef[] = [];

  const visit = (node: any) => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (node.type === "content-link") {
      const entityType = node.contentType as MentionEntityType;
      if (
        entityType === "card" ||
        entityType === "article" ||
        entityType === "project-item" ||
        entityType === "document-item"
      ) {
        mentions.push({
          entityType,
          entityId: Number(node.refId) || 0,
          contentId: Number(node.contentId) || 0,
          title: String(node.contentTitle || ""),
          previewText: typeof node.previewText === "string" ? node.previewText : "",
        });
      }
      return;
    }

    if (Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };

  content.forEach(visit);
  return mentions;
};

const ChatInputArea = forwardRef<ChatInputAreaHandle, ChatInputAreaProps>(
  (
    {
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
      showMcpManager = true,
      agentType = "local",
      onAgentTypeChange,
      agentTypeDisabled = false,
      codexWorkingDirectory = null,
      onSelectCodexWorkingDirectory,
      onClearCodexWorkingDirectory,
    },
    ref
  ) => {
    const uploadResourceFn = useUploadResource();
    const openMcpManagerModal = useMCPManagerModalStore(state => state.openModal);
    const { theme } = useTheme();

    const services: ChatInputAreaServices = useMemo(
      () => ({
        uploadFile: uploadResourceFn,
        convertFileSrc,
        getHomeDir,
      }),
      [uploadResourceFn]
    );
    const resolvedPlaceholder = useMemo(
      () => resolveChatInputPlaceholder(placeholder),
      [placeholder]
    );

    const { uploadFile, getHomeDir: getChatHomeDir } = services;

    const editorRef = useRef<EditorRef>(null);

    const [editorContent, setEditorContent] = useState<Descendant[]>(createEmptyEditorContent);
    const [images, setImages] = useState<ChatImageItem[]>([]);
    const [files, setFiles] = useState<ChatFileItem[]>([]);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadingPdf, setUploadingPdf] = useState(false);
    const [isNewChatTooltipOpen, setIsNewChatTooltipOpen] = useState(false);
    const [isNewChatTooltipReopenLocked, setIsNewChatTooltipReopenLocked] = useState(false);

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

    const resolveAbsolutePath = useMemoizedFn(async (path: string) => {
      if (path.startsWith("~")) {
        const homeDir = await getChatHomeDir();
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

    const handlePasteCapture = useMemoizedFn((event: React.ClipboardEvent<HTMLDivElement>) => {
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

      event.preventDefault();
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

    const applyEditorContent = useMemoizedFn((nextContent: Descendant[]) => {
      setEditorContent(nextContent);
      editorRef.current?.setEditorValue(nextContent);
    });

    const hotkeyConfigs = useMemo<IHotKeyConfig[]>(
      () => [
        {
          hotKey: "mod+enter",
          action: (_editor, event) => {
            event.preventDefault();
            onPressEnter?.();
          },
        },
      ],
      [onPressEnter]
    );

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

        const text = getMarkdown(editorContent).trim();
        if (text) {
          content.push({
            type: "text",
            text,
            mentions: extractMentionRefsFromEditorContent(editorContent),
          });
        }

        return content;
      },
      clear: () => {
        applyEditorContent(createEmptyEditorContent());
        setImages([]);
        setFiles([]);
      },
      setValue: (content: string) => {
        const nextContent = content.trim()
          ? importFromMarkdown(content)
          : createEmptyEditorContent();
        applyEditorContent(nextContent);
      },
      appendMention: mention => {
        const editorHandle = editorRef.current;
        if (!editorHandle) return;

        editorHandle.focus();
        const editor = editorHandle.getEditor();
        wrapContentLink(
          editor,
          mention.contentId,
          mention.entityType,
          mention.title,
          mention.entityId,
          mention.title
        );
        editor.insertText(" ");
      },
      focusEnd: () => {
        editorRef.current?.focus();
      },
    }));

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
                "text-[var(--th-active-text)]": option.value === reasoningEffort,
              })}
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-xs text-gray-500">{option.description}</span>
              </div>
              {option.value === reasoningEffort && (
                <CheckOutlined className="text-[var(--th-accent)]" />
              )}
            </div>
          ),
        })),
      [availableReasoningEffortOptions, reasoningEffort]
    );
    const reasoningControlDisabled = reasoningEffortDisabled || sendLoading || !contentEditable;
    const agentTypeMenuItems = useMemo(
      () => [
        {
          key: "local",
          label: (
            <div className="flex min-w-[160px] items-center justify-between gap-3">
              <span>本地代理</span>
              {agentType === "local" && <CheckOutlined />}
            </div>
          ),
        },
        {
          key: "codex",
          label: (
            <div className="flex min-w-[160px] items-center justify-between gap-3">
              <span>Codex</span>
              {agentType === "codex" && <CheckOutlined />}
            </div>
          ),
        },
      ],
      [agentType]
    );
    const agentTypeControlDisabled = agentTypeDisabled || sendLoading || !contentEditable;
    const codexWorkspaceControlDisabled = sendLoading || !contentEditable;
    const codexWorkspaceLabel = useMemo(() => {
      if (!codexWorkingDirectory) {
        return "临时目录";
      }
      const normalized = codexWorkingDirectory.replace(/\\/g, "/");
      const parts = normalized.split("/").filter(Boolean);
      if (parts.length <= 2) {
        return normalized;
      }
      return `.../${parts.slice(-2).join("/")}`;
    }, [codexWorkingDirectory]);
    const codexWorkspaceMenuItems = useMemo<MenuProps["items"]>(
      () => [
        {
          key: "select",
          label: "选择工作区目录",
        },
        {
          key: "temporary",
          label: "使用临时目录",
          disabled: !codexWorkingDirectory,
        },
      ],
      [codexWorkingDirectory]
    );

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

        <div
          className={classnames("mb-2 px-1 py-1", {
            "opacity-60": !contentEditable,
          })}
          onPasteCapture={handlePasteCapture}
        >
          <div className={styles.editorScrollContainer}>
            <Editor
              ref={editorRef}
              initValue={editorContent}
              onChange={value => {
                setEditorContent(value);
              }}
              readonly={!contentEditable}
              extensions={[contentLinkExtension]}
              hotkeyConfigs={hotkeyConfigs}
              placeHolder={resolvedPlaceholder}
              theme={theme}
              className={classnames("min-h-[24px]", styles.editorInput)}
            />
          </div>
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

            {onAgentTypeChange && (
              <Dropdown
                menu={{
                  items: agentTypeMenuItems,
                  onClick: ({ key }) => onAgentTypeChange(key as ChatAgentType),
                }}
                trigger={["click"]}
                disabled={agentTypeControlDisabled}
              >
                <span
                  style={{
                    display: "inline-block",
                    cursor: agentTypeControlDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  <Tooltip
                    placement="left"
                    title={agentTypeControlDisabled ? "本次会话已锁定代理" : "选择代理"}
                  >
                    <Button
                      type="text"
                      size="small"
                      disabled={agentTypeControlDisabled}
                      className="p-1! bg-none! border-none! hover:!bg-gray-100! dark:hover:!bg-white/10! text-gray-600! dark:text-gray-400! flex items-center gap-1.5"
                      style={{
                        pointerEvents: agentTypeControlDisabled ? "none" : "auto",
                      }}
                    >
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        {agentType === "codex" ? "Codex" : "本地代理"}
                      </span>
                      <DownOutlined className="text-[10px] text-gray-500 dark:text-gray-400" />
                    </Button>
                  </Tooltip>
                </span>
              </Dropdown>
            )}

            {agentType === "codex" && onSelectCodexWorkingDirectory && (
              <Dropdown
                menu={{
                  items: codexWorkspaceMenuItems,
                  onClick: ({ key }) => {
                    if (key === "temporary") {
                      onClearCodexWorkingDirectory?.();
                      return;
                    }
                    onSelectCodexWorkingDirectory();
                  },
                }}
                trigger={["click"]}
                disabled={codexWorkspaceControlDisabled}
              >
                <span
                  style={{
                    display: "inline-block",
                    cursor: codexWorkspaceControlDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  <Tooltip
                    placement="right"
                    title={codexWorkingDirectory || "未选择工作区，每次请求使用临时目录"}
                  >
                    <Button
                      type="text"
                      size="small"
                      disabled={codexWorkspaceControlDisabled}
                      icon={<FolderOpenOutlined />}
                      className="p-1! bg-none! border-none! hover:!bg-gray-100! dark:hover:!bg-white/10! text-gray-600! dark:text-gray-400! flex max-w-[220px] items-center gap-1.5"
                      style={{
                        pointerEvents: codexWorkspaceControlDisabled ? "none" : "auto",
                      }}
                    >
                      <span className="min-w-0 truncate text-xs font-medium text-gray-600 dark:text-gray-400">
                        工作区: {codexWorkspaceLabel}
                      </span>
                      <DownOutlined className="text-[10px] text-gray-500 dark:text-gray-400" />
                    </Button>
                  </Tooltip>
                </span>
              </Dropdown>
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

            {showMcpManager && (
              <Tooltip title="MCP 管理中心">
                <Button
                  type="text"
                  size="small"
                  icon={<ApiOutlined />}
                  disabled={sendLoading}
                  className="p-1! bg-none! border-none! hover:!bg-gray-100! dark:hover:!bg-white/10! text-gray-600! dark:text-gray-400!"
                  onClick={openMcpManagerModal}
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
                  <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-[var(--th-accent)] px-1 text-center text-[10px] leading-4 text-white">
                    {queuedMessageCount}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {previewImage && (
          <div
            className="fixed inset-0 flex cursor-zoom-out items-center justify-center bg-black/60"
            style={{ zIndex: 9999 }}
            onClick={() => setPreviewImage(null)}
          >
            <img src={previewImage} alt="预览" className="max-h-full max-w-full" />
            <CloseOutlined
              className="text-white! hover:bg-gray-500! absolute right-4 top-4 h-5 w-5 cursor-pointer rounded-full p-1 duration-200"
              onClick={() => setPreviewImage(null)}
            />
          </div>
        )}
      </div>
    );
  }
);

ChatInputArea.displayName = "ChatInputArea";

export default ChatInputArea;
