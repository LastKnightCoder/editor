import React, { useRef, useEffect, useState } from "react";
import { Modal, Button, Tooltip, App } from "antd";
import { Descendant } from "slate";
import { CloseOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import Editor, { EditorRef } from "@/components/Editor";
import ErrorBoundary from "@/components/ErrorBoundary";
import EditText, { EditTextHandle } from "@/components/EditText";
import useUploadResource from "@/hooks/useUploadResource";
import useEditContent from "@/hooks/useEditContent";
import { getContentById } from "@/commands/content";
import { IContent } from "@/types";
import { formatDate } from "@/utils";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
];

interface RichTextEditModalProps {
  visible: boolean;
  contentId: number;
  title: string;
  onClose: () => void;
  onTitleChange: (title: string) => void;
}

const RichTextEditModal: React.FC<RichTextEditModalProps> = ({
  visible,
  contentId,
  title: initialTitle,
  onClose,
  onTitleChange,
}) => {
  const editorRef = useRef<EditorRef>(null);
  const titleRef = useRef<EditTextHandle>(null);
  const [content, setContent] = useState<IContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [editorContent, setEditorContent] = useState<Descendant[]>([]);
  const [title, setTitle] = useState(initialTitle);
  const { message } = App.useApp();

  const uploadResource = useUploadResource();
  const { throttleHandleEditorContentChange } = useEditContent(
    contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
    },
  );

  // 加载内容
  const loadContent = useMemoizedFn(async () => {
    if (!contentId) return;

    setLoading(true);
    try {
      const contentData = await getContentById(contentId);
      if (contentData) {
        setContent(contentData);
        setEditorContent(contentData.content);
        editorRef.current?.setEditorValue(contentData.content);
      }
    } catch (error) {
      console.error("加载内容失败:", error);
      message.error("加载内容失败");
    } finally {
      setLoading(false);
    }
  });

  // 内容变化处理
  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    setEditorContent(content);
    throttleHandleEditorContentChange(content);
  });

  // 关闭处理
  const handleClose = useMemoizedFn(() => {
    onClose();
  });

  // 初始化编辑器
  const onInit = useMemoizedFn(() => {
    if (editorContent.length > 0) {
      editorRef.current?.setEditorValue(editorContent);
    }
  });

  // 效果：加载内容
  useEffect(() => {
    if (visible && contentId) {
      loadContent();
      setTitle(initialTitle);
      // 设置标题输入框的值
      if (titleRef.current) {
        titleRef.current.setValue(initialTitle);
      }
    }
  }, [visible, contentId, initialTitle, loadContent]);

  const renderHeader = () => (
    <div className="w-full flex justify-between items-center">
      <div className="flex-1 mr-4">
        <EditText
          ref={titleRef}
          defaultValue={title}
          contentEditable={true}
          onChange={onTitleChange}
          className="text-lg font-medium outline-none border-none bg-transparent w-full min-h-[32px] leading-8"
          style={{
            color: "inherit",
            fontSize: "inherit",
            fontWeight: "inherit",
          }}
        />
      </div>
      <div className="flex text-xs gap-2.5 text-gray-500">
        {content && (
          <>
            <div>
              <span>创建于 {formatDate(content.createTime, true)}</span>
            </div>
            <div>
              <span>最后修改于 {formatDate(content.updateTime, true)}</span>
            </div>
            <div>字数：{content.count}</div>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 ml-4">
        <Tooltip title="关闭">
          <Button type="text" icon={<CloseOutlined />} onClick={handleClose} />
        </Tooltip>
      </div>
    </div>
  );

  return (
    <Modal
      title={renderHeader()}
      open={visible && !!contentId}
      onCancel={handleClose}
      footer={null}
      closable={false}
      width={720}
      styles={{
        header: {
          marginBottom: 0,
          padding: "0 12px 12px 24px",
          borderBottom: "1px solid var(--border-color)",
        },
        content: {
          overflow: "hidden",
        },
        body: {
          padding: "0 24px 24px",
          maxHeight: "60vh",
          overflow: "auto",
        },
      }}
      destroyOnClose
      keyboard={false}
    >
      {loading ? (
        <div className="flex justify-center items-center h-75 text-[length:var(--font-size)]">
          加载中...
        </div>
      ) : (
        <div className="min-h-96 text-[length:var(--font-size)]">
          <ErrorBoundary>
            <Editor
              key={contentId}
              ref={editorRef}
              onInit={onInit}
              initValue={editorContent}
              onChange={onContentChange}
              extensions={customExtensions}
              uploadResource={uploadResource}
              readonly={false}
            />
          </ErrorBoundary>
        </div>
      )}
    </Modal>
  );
};

export default RichTextEditModal;
