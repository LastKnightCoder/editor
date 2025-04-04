import Editor, { IExtension } from "@/components/Editor";
import { ICard } from "@/types";
import styles from "./index.module.less";
import { Empty } from "antd";
import { memo, useEffect, useState } from "react";

interface ICardContentProps {
  card?: ICard;
}

const CardContent = memo((props: ICardContentProps) => {
  const { card } = props;
  const [extensions, setExtensions] = useState<IExtension[]>([]);

  useEffect(() => {
    import("@/editor-extensions").then(
      ({ cardLinkExtension, fileAttachmentExtension }) => {
        setExtensions([cardLinkExtension, fileAttachmentExtension]);
      },
    );
  }, []);

  if (!card) {
    return (
      <div className={styles.notFound}>
        <Empty description="该卡片不存在或已被删除" />
      </div>
    );
  }

  return (
    <div className={styles.cardContentContainer}>
      <Editor initValue={card.content} readonly extensions={extensions} />
    </div>
  );
});

export default CardContent;
