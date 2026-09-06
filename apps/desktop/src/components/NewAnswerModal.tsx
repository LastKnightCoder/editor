import React, { useRef, useEffect, useState } from "react";
import { Descendant } from "slate";
import { useMemoizedFn, useUnmount } from "ahooks";
import { IExtension, EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import CustomModal from "@/components/CustomModal";
import useEditContent from "@/hooks/useEditContent";
import { createAnswer, addAnswer, deleteAnswer } from "@/commands/question";
import { getContentLength } from "@/utils";
import { getAnswerContentStatus, hasAnyAnswerProjection } from "@/utils/answer-content";

const DEFAULT_CONTENT: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
];

interface NewAnswerModalProps {
  visible: boolean;
  questionId: number | null;
  extensions: IExtension[];
  onClose: () => void;
  customTitle?: string;
}

const NewAnswerModal: React.FC<NewAnswerModalProps> = ({
  visible,
  questionId,
  extensions,
  onClose,
  customTitle = "新建答案",
}) => {
  const [answerId, setAnswerId] = useState<number>();
  const editorRef = useRef<EditorRef>(null);
  const contentRef = useRef<Descendant[]>(DEFAULT_CONTENT);
  const questionIdRef = useRef<number | null>(null);

  const { throttleHandleEditorContentChange } = useEditContent(answerId, data => {
    editorRef.current?.setEditorValue(data);
  });

  const createAndLinkAnswer = useMemoizedFn(async () => {
    if (!questionId) return;
    questionIdRef.current = questionId;
    const ans = await createAnswer(DEFAULT_CONTENT);
    await addAnswer(questionId, { contentId: ans.id, content: ans.content }, false);
    setAnswerId(ans.id);
  });

  useEffect(() => {
    if (visible && questionId && !answerId) {
      createAndLinkAnswer();
    }
  }, [visible, questionId, answerId, createAndLinkAnswer]);

  const handleClose = useMemoizedFn(async () => {
    if (answerId && questionIdRef.current) {
      throttleHandleEditorContentChange.flush();
      const isEmpty = getContentLength(contentRef.current) === 0;
      const status = await getAnswerContentStatus(answerId);
      if (isEmpty && !hasAnyAnswerProjection(status)) {
        await deleteAnswer(questionIdRef.current, answerId);
      }
    }
    setAnswerId(undefined);
    contentRef.current = DEFAULT_CONTENT;
    questionIdRef.current = null;
    onClose();
  });

  useUnmount(() => {
    throttleHandleEditorContentChange.flush();
  });

  const handleContentChange = useMemoizedFn((content: Descendant[]) => {
    contentRef.current = content;
    throttleHandleEditorContentChange(content);
  });

  const icon = (
    <svg
      className="h-5 w-5 text-[var(--th-accent)]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );

  return (
    <CustomModal
      open={visible}
      onCancel={handleClose}
      width={800}
      title={customTitle}
      subtitle="创建新的答案内容"
      icon={icon}
      iconBgColor="bg-[var(--th-accent-soft)] border-[var(--th-border-focus)]/30"
      footer={null}
      closeOnEscape={false}
    >
      <div className="min-h-75 rounded-[6px]">
        <Editor
          contentId={answerId}
          key={answerId}
          ref={editorRef}
          initValue={DEFAULT_CONTENT}
          onChange={handleContentChange}
          readonly={false}
          extensions={extensions}
          style={{ maxHeight: 600, overflow: "auto", padding: 20 }}
        />
      </div>
    </CustomModal>
  );
};

export default NewAnswerModal;
