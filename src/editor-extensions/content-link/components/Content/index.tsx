import Editor from "@/components/Editor";
import { IContent } from "@/types";
import styles from "./index.module.less";
import { Empty } from "antd";
import { memo } from "react";
import useDynamicExtensions from "@/hooks/useDynamicExtensions";

interface IContentProps {
  content: IContent | null;
}

const Content = memo((props: IContentProps) => {
  const { content } = props;
  const extensions = useDynamicExtensions();

  if (!content) {
    return (
      <div className={styles.notFound}>
        <Empty description="内容不存在或已被删除" />
      </div>
    );
  }

  return (
    <div className={styles.contentContentContainer}>
      <Editor
        key={content.id}
        initValue={content.content}
        readonly
        extensions={extensions}
      />
    </div>
  );
});

export default Content;
