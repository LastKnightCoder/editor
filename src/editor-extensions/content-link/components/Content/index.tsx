import Editor, { IExtension } from "@/components/Editor";
import { IContent } from "@/types";
import styles from "./index.module.less";
import { Empty } from "antd";
import { memo, useEffect, useState } from "react";
// import { useDynamicExtensions } from "@/hooks";
// import {
//   contentLinkExtension,
//   fileAttachmentExtension,
//   questionCardExtension,
//   chatReferenceExtension,
// } from "@/editor-extensions";
// const customExtensions = [
//   contentLinkExtension,
//   fileAttachmentExtension,
//   questionCardExtension,
//   chatReferenceExtension,
// ];

interface IContentProps {
  content: IContent | null;
}

const Content = memo((props: IContentProps) => {
  const { content } = props;

  const [extensions, setExtensions] = useState<IExtension[]>([]);
  useEffect(() => {
    import("@/editor-extensions").then(
      ({
        contentLinkExtension,
        fileAttachmentExtension,
        questionCardExtension,
        chatReferenceExtension,
      }) => {
        setExtensions([
          contentLinkExtension,
          fileAttachmentExtension,
          questionCardExtension,
          chatReferenceExtension,
        ]);
      },
    );
  }, []);
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
