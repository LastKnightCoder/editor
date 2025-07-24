import React, {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Button, Upload, Modal, Input, message } from "antd";
import {
  PictureOutlined,
  LinkOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import classnames from "classnames";
import { MessageContent } from "@/types/llm";
import styles from "./index.module.less";

const { TextArea } = Input;

export interface MultiModalInputHandle {
  getValue: () => MessageContent[];
  clear: () => void;
  setValue: (content: string) => void;
  focusEnd: () => void;
}

interface MultiModalInputProps {
  className?: string;
  contentEditable?: boolean;
  onPressEnter?: () => void;
  placeholder?: string;
}

const MultiModalInput = forwardRef<MultiModalInputHandle, MultiModalInputProps>(
  (
    {
      className,
      contentEditable = true,
      onPressEnter,
      placeholder = "输入消息...",
    },
    ref,
  ) => {
    const [textContent, setTextContent] = useState("");
    const [images, setImages] = useState<string[]>([]);
    const [urlModalVisible, setUrlModalVisible] = useState(false);
    const [urlInput, setUrlInput] = useState("");
    const textAreaRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      getValue: (): MessageContent[] => {
        const content: MessageContent[] = [];

        // 添加图片内容
        images.forEach((image) => {
          content.push({ type: "image", image });
        });

        // 添加文本内容
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
        if (textAreaRef.current) {
          textAreaRef.current.focus();
          const length = textContent.length;
          textAreaRef.current.setSelectionRange(length, length);
        }
      },
    }));

    // 将图片转换为 base64
    const convertToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    };

    // 处理本地文件上传
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

    // 处理 URL 输入
    const handleUrlSubmit = () => {
      if (urlInput.trim()) {
        setImages((prev) => [...prev, urlInput.trim()]);
        setUrlInput("");
        setUrlModalVisible(false);
        message.success("图片链接添加成功");
      }
    };

    // 删除图片
    const removeImage = (index: number) => {
      setImages((prev) => prev.filter((_, i) => i !== index));
    };

    // 处理键盘事件
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onPressEnter?.();
      }
    };

    return (
      <div className={classnames(styles.container, className)}>
        {/* 图片预览区域 */}
        {images.length > 0 && (
          <div className={styles.imagesPreview}>
            {images.map((image, index) => (
              <div key={index} className={styles.imagePreviewItem}>
                <img
                  src={image}
                  alt={`预览 ${index + 1}`}
                  className={styles.previewImage}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  className={styles.deleteButton}
                  onClick={() => removeImage(index)}
                />
              </div>
            ))}
          </div>
        )}

        {/* 输入区域 */}
        <div className={styles.inputArea}>
          <TextArea
            ref={textAreaRef}
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoSize={{ minRows: 1, maxRows: 6 }}
            disabled={!contentEditable}
            className={styles.textArea}
            variant="borderless"
          />

          {/* 工具栏 */}
          <div className={styles.toolbar}>
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
                title="上传图片"
              />
            </Upload>

            <Button
              type="text"
              icon={<LinkOutlined />}
              size="small"
              disabled={!contentEditable}
              onClick={() => setUrlModalVisible(true)}
              title="添加图片链接"
            />
          </div>
        </div>

        {/* URL 输入模态框 */}
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
      </div>
    );
  },
);

MultiModalInput.displayName = "MultiModalInput";

export default MultiModalInput;
