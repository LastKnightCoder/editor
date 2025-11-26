import React, {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useMemo,
} from "react";
import { useMemoizedFn } from "ahooks";
import { Button, Upload, message, Dropdown, Tooltip, Input } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";

import {
  PictureOutlined,
  FilePdfOutlined,
  WechatWorkOutlined,
  SettingOutlined,
  SendOutlined,
  CloseOutlined,
  StopOutlined,
  BulbOutlined,
  CheckOutlined,
  ApiOutlined,
} from "@ant-design/icons";
import classnames from "classnames";
import { MessageContent, ReasoningEffort } from "@/types/llm";
import PortalToBody from "../PortalToBody";
import MCPManagerModal from "@/components/MCPManagerModal";
import useUploadResource from "@/hooks/useUploadResource";
import {
  convertFileSrc,
  createOrUpdateResource,
  getHomeDir,
  decrementResourceRefCount,
  incrementResourceRefCount,
} from "@/commands";
import type { IResource, IResourceSource } from "@/types";
import { v4 as uuid } from "uuid";
import { LuBrain } from "react-icons/lu";

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
    description: "深度推理，追求最强分析能力",
  },
];

interface ChatImageItem {
  id: string;
  previewUrl: string;
  resourceId: number;
  path: string;
}

interface ChatFileItem {
  id: string;
  name: string;
  path: string;
  resourceId: number;
}

export interface ChatInputAreaHandle {
  getValue: () => MessageContent[];
  clear: (options?: { releaseResources?: boolean }) => void;
  setValue: (content: string) => void;
  focusEnd: () => void;
}

interface ChatInputAreaProps {
  className?: string;
  contentEditable?: boolean;
  onPressEnter?: () => void;
  onStop?: () => void;
  placeholder?: string;
  sendLoading?: boolean;
  createMessageLoading?: boolean;
  onCreateNewMessage?: () => void;
  modelSelectItems?: any[];
  onModelSelect?: ({ key }: { key: string }) => void;
  currentModelName?: string;
  isSupportImage?: boolean;
  isSupportFile?: boolean;
  promptSelectItems?: any[];
  onPromptSelect?: ({ key }: { key: string }) => void;
  currentPromptName?: string;
  promptSelectDisabled?: boolean;
  resourceSource?: IResourceSource | null;
  reasoningEffort?: ReasoningEffort;
  onReasoningEffortChange?: (level: ReasoningEffort) => void;
  reasoningEffortDisabled?: boolean;
}

const ChatInputArea = forwardRef<ChatInputAreaHandle, ChatInputAreaProps>(
  (
    {
      className,
      contentEditable = true,
      onPressEnter,
      onStop,
      placeholder = "输入消息...",
      sendLoading = false,
      createMessageLoading = false,
      onCreateNewMessage,
      modelSelectItems = [],
      onModelSelect,
      currentModelName,
      isSupportImage = false,
      isSupportFile = false,
      promptSelectItems = [],
      onPromptSelect,
      currentPromptName,
      promptSelectDisabled = false,
      resourceSource = null,
      reasoningEffort,
      onReasoningEffortChange,
      reasoningEffortDisabled = false,
    },
    ref,
  ) => {
    const uploadResourceFn = useUploadResource();
    const [textContent, setTextContent] = useState("");
    const [images, setImages] = useState<ChatImageItem[]>([]);
    const [files, setFiles] = useState<ChatFileItem[]>([]);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadingPdf, setUploadingPdf] = useState(false);
    const [mcpManagerOpen, setMcpManagerOpen] = useState(false);
    const imagesRef = useRef<ChatImageItem[]>([]);
    const filesRef = useRef<ChatFileItem[]>([]);
    const showReasoningEffortControl =
      typeof reasoningEffort !== "undefined" &&
      typeof onReasoningEffortChange === "function";
    const currentReasoningOption = REASONING_EFFORT_OPTIONS.find(
      (option) => option.value === reasoningEffort,
    );
    const reasoningEffortMenuItems = useMemo(
      () =>
        REASONING_EFFORT_OPTIONS.map((option) => ({
          key: option.value,
          label: (
            <div
              className={classnames(
                "flex items-center justify-between gap-3 min-w-[180px]",
                {
                  "text-blue-600": option.value === reasoningEffort,
                },
              )}
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-xs text-gray-500">
                  {option.description}
                </span>
              </div>
              {option.value === reasoningEffort && (
                <CheckOutlined className="text-blue-500" />
              )}
            </div>
          ),
        })),
      [reasoningEffort],
    );
    const reasoningControlDisabled =
      reasoningEffortDisabled || sendLoading || !contentEditable;
    const reasoningTooltip = currentReasoningOption
      ? `${currentReasoningOption.label} · ${currentReasoningOption.description}`
      : "选择推理强度";

    const releaseResources = useMemoizedFn((items: Array<{ path: string }>) => {
      items.forEach((item) => {
        decrementResourceRefCount(item.path).catch((error) => {
          console.error("减少资源引用失败:", error);
        });
      });
    });

    const trackResourceUsage = useMemoizedFn(async (resource: IResource) => {
      try {
        await incrementResourceRefCount(
          resource.path,
          resourceSource ?? undefined,
        );
      } catch (error) {
        console.error("增加资源引用失败:", error);
      }
    });

    useEffect(() => {
      imagesRef.current = images;
    }, [images]);

    useEffect(() => {
      filesRef.current = files;
    }, [files]);

    useEffect(() => {
      return () => {
        if (imagesRef.current.length > 0) {
          releaseResources(imagesRef.current);
        }
        if (filesRef.current.length > 0) {
          releaseResources(filesRef.current);
        }
      };
    }, [releaseResources]);

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

    const appendResourceImage = useMemoizedFn(async (resource: IResource) => {
      let previewUrl = resource.path;
      try {
        previewUrl = await getPreviewUrlFromPath(resource.path);
      } catch (error) {
        console.error("生成图片预览失败:", error);
      }
      const imageItem: ChatImageItem = {
        id: `${resource.id}-${uuid()}`,
        previewUrl,
        resourceId: resource.id,
        path: resource.path,
      };
      setImages((prev) => [...prev, imageItem]);
      void trackResourceUsage(resource);
    });

    const appendResourceFile = useMemoizedFn((resource: IResource) => {
      const fileItem: ChatFileItem = {
        id: `${resource.id}-${uuid()}`,
        name: resource.name,
        path: resource.path,
        resourceId: resource.id,
      };
      setFiles((prev) => [...prev, fileItem]);
      void trackResourceUsage(resource);
    });

    const textAreaRef = useRef<TextAreaRef>(null);

    useImperativeHandle(ref, () => ({
      getValue: (): MessageContent[] => {
        const content: MessageContent[] = [];

        images.forEach((image) => {
          content.push({
            type: "image",
            image: image.previewUrl,
            resourceId: image.resourceId,
          });
        });

        files.forEach((file) => {
          content.push({
            type: "file",
            file: file.path,
            resourceId: file.resourceId,
            fileName: file.name,
          });
        });

        if (textContent.trim()) {
          content.push({ type: "text", text: textContent.trim() });
        }

        return content;
      },
      clear: (options) => {
        if (options?.releaseResources) {
          if (images.length > 0) {
            releaseResources(images);
          }
          if (files.length > 0) {
            releaseResources(files);
          }
        }
        setTextContent("");
        setImages([]);
        setFiles([]);
      },
      setValue: (content: string) => {
        setTextContent(content);
      },
      focusEnd: () => {
        if (textAreaRef.current?.resizableTextArea?.textArea) {
          const textArea = textAreaRef.current.resizableTextArea
            .textArea as HTMLTextAreaElement;
          textArea.focus();
          const length = textContent.length;
          textArea.setSelectionRange(length, length);
        }
      },
    }));

    const handleImageUpload = async (file: File) => {
      try {
        setUploadingImage(true);
        const uploadedPath = await uploadResourceFn(file);
        if (!uploadedPath) {
          message.error("图片上传失败");
          return false;
        }
        const resource = await createOrUpdateResource({
          name: file.name,
          path: uploadedPath,
          type: "image",
          source: resourceSource ?? undefined,
        });
        await appendResourceImage(resource);
        message.success("图片上传成功");
      } catch (error) {
        console.error("图片上传失败:", error);
        message.error("图片上传失败");
      } finally {
        setUploadingImage(false);
      }
      return false; // 阻止默认上传行为
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
        const uploadedPath = await uploadResourceFn(file);
        if (!uploadedPath) {
          message.error("PDF 上传失败");
          return false;
        }
        const resource = await createOrUpdateResource({
          name: file.name,
          path: uploadedPath,
          type: "pdf",
          source: resourceSource ?? undefined,
        });
        appendResourceFile(resource);
        message.success("PDF 上传成功");
      } catch (error) {
        console.error("PDF 上传失败:", error);
        message.error("PDF 上传失败");
      } finally {
        setUploadingPdf(false);
      }
      return false;
    };

    const handlePaste = useMemoizedFn(
      (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return;

        const imageItems = isSupportImage
          ? Array.from(clipboardData.items).filter(
              (item) => item.kind === "file" && item.type.startsWith("image/"),
            )
          : [];
        const pdfItems = isSupportFile
          ? Array.from(clipboardData.items).filter(
              (item) =>
                item.kind === "file" &&
                item.type.toLowerCase() === "application/pdf",
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
      },
    );

    const removeImage = useMemoizedFn((imageId: string) => {
      setImages((prev) => {
        const target = prev.find((image) => image.id === imageId);
        if (target) {
          releaseResources([target]);
        }
        return prev.filter((image) => image.id !== imageId);
      });
    });

    const removeFile = useMemoizedFn((fileId: string) => {
      setFiles((prev) => {
        const target = prev.find((file) => file.id === fileId);
        if (target) {
          releaseResources([target]);
        }
        return prev.filter((file) => file.id !== fileId);
      });
    });

    const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onPressEnter?.();
      }
    });

    return (
      <div className={classnames("flex flex-col p-2", className)}>
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {images.map((image, index) => (
              <div key={image.id} className="relative w-12 h-12 group/image">
                <img
                  src={image.previewUrl}
                  alt={`预览 ${index + 1}`}
                  className="w-12 h-12 object-cover rounded-lg border border-gray-200 cursor-zoom-in"
                  onClick={() => setPreviewImage(image.previewUrl)}
                />
                <CloseOutlined
                  className="w-4 h-4 absolute top-1 right-1 opacity-0 group-hover/image:opacity-100 transition-opacity duration-200 rounded-full p-1 text-white! hover:bg-gray-500! cursor-pointer"
                  onClick={() => removeImage(image.id)}
                />
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <div className="flex flex-col gap-2 mb-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <FilePdfOutlined className="text-red-500 shrink-0" />
                  <span className="text-sm text-gray-800 dark:text-gray-100 truncate">
                    {file.name}
                  </span>
                </div>
                <CloseOutlined
                  className="w-4 h-4 text-gray-400 hover:text-gray-700 cursor-pointer"
                  onClick={() => removeFile(file.id)}
                />
              </div>
            ))}
          </div>
        )}

        <div className="mb-2">
          <TextArea
            ref={textAreaRef}
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            autoSize={{ minRows: 1, maxRows: 6 }}
            disabled={!contentEditable}
            className="w-full resize-none border-none focus:ring-0 focus:border-blue-400 bg-transparent text-base px-0!"
            variant="borderless"
          />
        </div>

        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-1.5">
            {onCreateNewMessage && (
              <Tooltip title="新建对话">
                <Button
                  type="text"
                  size="small"
                  icon={<WechatWorkOutlined />}
                  onClick={onCreateNewMessage}
                  loading={createMessageLoading}
                  disabled={sendLoading}
                  className="p-1! bg-none! border-none! hover:!bg-gray-100!"
                />
              </Tooltip>
            )}

            {modelSelectItems.length > 0 && onModelSelect && (
              <Tooltip title={currentModelName || "选择模型"}>
                <Dropdown
                  menu={{
                    items: modelSelectItems,
                    onClick: onModelSelect,
                  }}
                  trigger={["click"]}
                  disabled={sendLoading}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<SettingOutlined />}
                    className="p-1! bg-none! border-none! hover:!bg-gray-100!"
                  />
                </Dropdown>
              </Tooltip>
            )}
            {promptSelectItems.length > 0 && onPromptSelect && (
              <Tooltip
                title={
                  promptSelectDisabled
                    ? "对话开始后无法修改 Prompt"
                    : currentPromptName || "选择系统 Prompt"
                }
              >
                <Dropdown
                  menu={{
                    items: promptSelectItems,
                    onClick: onPromptSelect,
                  }}
                  trigger={["click"]}
                  disabled={promptSelectDisabled || sendLoading}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<BulbOutlined />}
                    className="p-1! bg-none! border-none! hover:!bg-gray-100!"
                  />
                </Dropdown>
              </Tooltip>
            )}
            {showReasoningEffortControl && (
              <Tooltip title={reasoningTooltip}>
                <Dropdown
                  menu={{
                    items: reasoningEffortMenuItems,
                    onClick: ({ key }) =>
                      onReasoningEffortChange?.(key as ReasoningEffort),
                  }}
                  trigger={["click"]}
                  disabled={reasoningControlDisabled}
                >
                  <Button
                    type="text"
                    size="small"
                    disabled={reasoningControlDisabled}
                    className="p-1! bg-none! border-none! hover:!bg-gray-100! flex items-center gap-1.5"
                  >
                    <LuBrain className="text-base" />
                    <span className="text-xs font-medium">
                      {currentReasoningOption?.label ?? "立答如流"}
                    </span>
                  </Button>
                </Dropdown>
              </Tooltip>
            )}
            <Tooltip title="MCP 管理中心">
              <Button
                type="text"
                size="small"
                icon={<ApiOutlined />}
                disabled={sendLoading}
                className="p-1! bg-none! border-none! hover:!bg-gray-100!"
                onClick={() => setMcpManagerOpen(true)}
              />
            </Tooltip>
            {isSupportImage && (
              <Tooltip title="上传图片">
                <Upload
                  accept="image/png, image/jpeg, image/webp"
                  showUploadList={false}
                  beforeUpload={handleImageUpload}
                  disabled={!contentEditable || uploadingImage}
                >
                  <Button
                    type="text"
                    icon={<PictureOutlined />}
                    size="small"
                    disabled={!contentEditable || uploadingImage}
                    loading={uploadingImage}
                    className="p-1! rounded! bg-none! border-none! hover:!bg-gray-100!"
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
                  disabled={!contentEditable || uploadingPdf}
                >
                  <Button
                    type="text"
                    icon={<FilePdfOutlined />}
                    size="small"
                    disabled={!contentEditable || uploadingPdf}
                    loading={uploadingPdf}
                    className="p-1! rounded! bg-none! border-none! hover:!bg-gray-100!"
                  />
                </Upload>
              </Tooltip>
            )}
          </div>

          <div>
            {sendLoading ? (
              <Button
                type="text"
                size="small"
                onClick={onStop}
                icon={<StopOutlined />}
                className="p-1 rounded border-none! bg-none! hover:text-red-500! hover:bg-red-50! dark:hover:bg-red-900/20! shadow-none!"
                title="停止生成"
              />
            ) : (
              <Button
                type="text"
                size="small"
                onClick={onPressEnter}
                icon={<SendOutlined />}
                className="p-1 rounded border-none! bg-none! hover:!bg-gray-100! shadow-none!"
              />
            )}
          </div>
        </div>
        <PortalToBody>
          {previewImage && (
            <div
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center cursor-zoom-out"
              onClick={() => setPreviewImage(null)}
            >
              <div className="absolute inset-0 bg-black bg-opacity-50 -z-1" />
              <img
                src={previewImage}
                alt="预览"
                className="max-w-full max-h-full"
              />
              <CloseOutlined
                className="w-5 h-5 absolute top-4 right-4 duration-200 rounded-full p-1 cursor-pointer text-white! hover:bg-gray-500!"
                onClick={() => setPreviewImage(null)}
              />
            </div>
          )}
        </PortalToBody>
        <MCPManagerModal
          open={mcpManagerOpen}
          onClose={() => setMcpManagerOpen(false)}
        />
      </div>
    );
  },
);

ChatInputArea.displayName = "ChatInputArea";

export default ChatInputArea;
