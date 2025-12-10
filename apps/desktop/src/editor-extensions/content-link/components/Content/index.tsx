import { memo } from "react";
import { Editor } from "@tau/editor/src";
import { IContent } from "@/types";
import styles from "./index.module.less";
import { Empty } from "antd";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";

interface IContentProps {
  content: IContent | null;
}

const Content = memo((props: IContentProps) => {
  const { content } = props;

  const extensions = useDynamicExtensionsStore((state) => state.extensions);
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
