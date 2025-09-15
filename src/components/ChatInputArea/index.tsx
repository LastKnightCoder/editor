import React, {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Button, Upload, Modal, Input, message, Dropdown, Tooltip } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";

import {
  PictureOutlined,
  LinkOutlined,
  WechatWorkOutlined,
  SettingOutlined,
  SendOutlined,
  CloseOutlined,
  StopOutlined,
} from "@ant-design/icons";
import classnames from "classnames";
import { MessageContent } from "@/types/llm";
import PortalToBody from "../PortalToBody";

const { TextArea } = Input;

export interface ChatInputAreaHandle {
  getValue: () => MessageContent[];
  clear: () => void;
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
  isSupportMultiModal?: boolean;
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
      isSupportMultiModal = false,
    },
    ref,
  ) => {
    const [textContent, setTextContent] = useState("");
    const [images, setImages] = useState<string[]>([]);
    const [urlModalVisible, setUrlModalVisible] = useState(false);
    const [urlInput, setUrlInput] = useState("");
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    const textAreaRef = useRef<TextAreaRef>(null);

    useImperativeHandle(ref, () => ({
      getValue: (): MessageContent[] => {
        const content: MessageContent[] = [];

        images.forEach((image) => {
          content.push({ type: "image", image });
        });

        if (textContent.trim()) {
          content.push({ type: "text", text: textContent.trim() });
        }

        return content;
      },
      clear: () => {
        setTextContent("");
        setImages([]);
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

    const convertToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    };

    const handleFileUpload = async (file: File) => {
      try {
        const base64 = await convertToBase64(file);
        setImages((prev) => [...prev, base64]);
        message.success("图片上传成功");
      } catch (error) {
        message.error("图片转换失败");
      }
      return false; // 阻止默认上传行为
    };

    const handleUrlSubmit = () => {
      if (urlInput.trim()) {
        setImages((prev) => [...prev, urlInput.trim()]);
        setUrlInput("");
        setUrlModalVisible(false);
        message.success("图片链接添加成功");
      }
    };

    const removeImage = (index: number) => {
      setImages((prev) => prev.filter((_, i) => i !== index));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onPressEnter?.();
      }
    };

    return (
      <div className={classnames("flex flex-col p-2", className)}>
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {images.map((image, index) => (
              <div key={index} className="relative w-12 h-12 group/image">
                <img
                  src={image}
                  alt={`预览 ${index + 1}`}
                  className="w-12 h-12 object-cover rounded-lg border border-gray-200 cursor-zoom-in"
                  onClick={() => setPreviewImage(image)}
                />
                <CloseOutlined
                  className="w-4 h-4 absolute top-1 right-1 opacity-0 group-hover/image:opacity-100 transition-opacity duration-200 rounded-full p-1 text-white! hover:bg-gray-500! cursor-pointer"
                  onClick={() => removeImage(index)}
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
                  className="!p-1 bg-none! border-none! hover:!bg-gray-100!"
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
                    className="!p-1 bg-none! border-none! hover:!bg-gray-100!"
                  />
                </Dropdown>
              </Tooltip>
            )}
            {isSupportMultiModal && (
              <>
                <Tooltip title="上传图片">
                  <Upload
                    accept="image/png, image/jpeg, image/webp"
                    showUploadList={false}
                    beforeUpload={handleFileUpload}
                    disabled={!contentEditable}
                  >
                    <Button
                      type="text"
                      icon={<PictureOutlined />}
                      size="small"
                      disabled={!contentEditable}
                      className="!p-1 !rounded bg-none! border-none! hover:!bg-gray-100!"
                    />
                  </Upload>
                </Tooltip>

                <Tooltip title="添加图片链接">
                  <Button
                    type="text"
                    icon={<LinkOutlined />}
                    size="small"
                    disabled={!contentEditable}
                    onClick={() => setUrlModalVisible(true)}
                    className="!p-1 !rounded bg-none! border-none! hover:!bg-gray-100!"
                  />
                </Tooltip>
              </>
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

        <Modal
          title="添加图片链接"
          open={urlModalVisible}
          onOk={handleUrlSubmit}
          onCancel={() => {
            setUrlModalVisible(false);
            setUrlInput("");
          }}
          okText="添加"
          cancelText="取消"
        >
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="请输入图片链接"
            onPressEnter={handleUrlSubmit}
          />
        </Modal>
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
      </div>
    );
  },
);

ChatInputArea.displayName = "ChatInputArea";

export default ChatInputArea;
