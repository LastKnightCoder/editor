import { Descendant } from "slate";
import { Typography } from "antd";
import { getEditorTextValue } from "@/utils";

import styles from "./index.module.less";
import classnames from "classnames";

const { Paragraph } = Typography;

interface ICard {
  id: number;
  title: string;
  content: Descendant[];
}

interface ICardProps {
  card: ICard;
  onClick: (card: ICard) => void;
  selected?: boolean;
}

const Card = (props: ICardProps) => {
  const { card, onClick, selected = false } = props;

  return (
    <div
      className={classnames(styles.card, {
        [styles.selected]: selected,
      })}
      onClick={() => {
        onClick(card);
      }}
    >
      <div className={styles.title}>{card.title}</div>
      <Paragraph className={styles.content} ellipsis={{ rows: 4 }}>
        {getEditorTextValue(card.content) || "未知内容"}
      </Paragraph>
    </div>
  );
};

export default Card;
