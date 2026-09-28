import { getEditorText } from "@/utils";
import classnames from "classnames";
import { Descendant } from "slate";
import { ProjectItem } from "@/types";
import useProjectWebLinkMeta from "@/hooks/useProjectWebLinkMeta";

import styles from "./index.module.less";

interface ItemCardProps {
  item: Partial<ProjectItem> & {
    content: Descendant[];
  };
  onClick: () => void;
}

const ItemCard = (props: ItemCardProps) => {
  const { item, onClick } = props;

  const { title } = useProjectWebLinkMeta(item);

  return (
    <div contentEditable={false} className={classnames(styles.card, {})} onClick={onClick}>
      <div className={styles.title}>📄️{title || item.title}</div>
      <div className={styles.desc}>{getEditorText(item.content, 40)}</div>
    </div>
  );
};

export default ItemCard;
