import { useRef } from "react";
import { Button } from "antd";
import { useMemoizedFn } from "ahooks";
import Editor from "@/components/Editor";
import { Descendant } from "slate";

import styles from "./index.module.less";

interface CommentEditViewProps {
  content?: Descendant[];
  onFinish: (content: Descendant[]) => void;
  onCancel: () => void;
}

const CommentEditView = (props: CommentEditViewProps) => {
  const { content, onCancel, onFinish } = props;

  const containerRef = useRef<HTMLDivElement>(null);

  // 默认的空内容格式
  const defaultValue: Descendant[] = [
    {
      type: "paragraph",
      children: [{ type: "formatted", text: "" }],
    },
  ];
  const initialValue = content && content.length > 0 ? content : defaultValue;

  const editorContent = useRef<Descendant[]>(initialValue);

  const onContentChange = useMemoizedFn((value: Descendant[]) => {
    editorContent.current = value;
  });

  const handleFinish = useMemoizedFn(() => {
    // 检查内容是否为空
    const hasContent = editorContent.current.some((node) => {
      if ("children" in node) {
        return node.children.some(
          (child: any) => child.text && child.text.trim(),
        );
      }
      return false;
    });

    if (!hasContent) {
      return; // 如果没有内容，不执行任何操作，父组件会显示警告
    }

    onFinish(editorContent.current);
  });

  return (
    <div ref={containerRef} className={`${styles.commentContainer}`}>
      <div className={styles.header}>
        <span className={styles.title}>添加评论</span>
        <div className={styles.dragHandle}>⋮⋮</div>
      </div>
      <div className={styles.editorWrapper}>
        <Editor
          className={styles.editor}
          initValue={editorContent.current}
          readonly={false}
          onChange={onContentChange}
          placeHolder="在此输入您的评论..."
          theme="light"
        />
      </div>
      <div className={styles.buttons}>
        <Button className={styles.cancelButton} onClick={onCancel}>
          取消
        </Button>
        <Button
          type="primary"
          className={styles.confirmButton}
          onClick={handleFinish}
        >
          确定
        </Button>
      </div>
    </div>
  );
};

export default CommentEditView;
