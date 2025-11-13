import { getEditorText } from "@/utils";
import useTheme from "@/hooks/useTheme.ts";
import classnames from "classnames";
import { Descendant } from "slate";
import { extractUrlFromTitle } from "@/utils";

import styles from "./index.module.less";

interface ItemCardProps {
  item: {
    title: string;
    content: Descendant[];
  };
  onClick: () => void;
}

const ItemCard = (props: ItemCardProps) => {
  const { item, onClick } = props;

  const { isDark } = useTheme();

  return (
    <div
      contentEditable={false}
      className={classnames(styles.card, {
        [styles.dark]: isDark,
      })}
      onClick={onClick}
    >
      <div className={styles.title}>
        📄️{extractUrlFromTitle(item.title).title}
      </div>
      <div className={styles.desc}>{getEditorText(item.content, 40)}</div>
    </div>
  );
};

export default ItemCard;
