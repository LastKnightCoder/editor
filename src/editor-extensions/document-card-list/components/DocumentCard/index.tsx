import { getEditorText } from "@/utils";
import { IDocumentItem } from "@/types";
import useTheme from "@/hooks/useTheme";
import classnames from "classnames";

import styles from './index.module.less';

interface IDocumentCardProps {
  item: IDocumentItem;
  onClick: () => void;
}

const DocumentCard = (props: IDocumentCardProps) => {
  const { item, onClick } = props;

  const { isDark } = useTheme();

  return (
    <div contentEditable={false} className={classnames(styles.card, {
      [styles.dark]: isDark,
    })} onClick={onClick}>
      <div className={styles.title}>📄️{item.title}</div>
      <div className={styles.desc}>
        {getEditorText(item.content, 40)}
      </div>
    </div>
  )
}

export default DocumentCard;