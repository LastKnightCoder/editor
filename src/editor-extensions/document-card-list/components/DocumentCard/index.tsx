import styles from './index.module.less';
import { getEditorText } from "@/utils";
import { IDocumentItem } from "@/types";

interface IDocumentCardProps {
  item: IDocumentItem;
  onClick: () => void;
}

const DocumentCard = (props: IDocumentCardProps) => {
  const { item, onClick } = props;

  return (
    <div contentEditable={false} className={styles.card} onClick={onClick}>
      <div className={styles.title}>📄️{item.title}</div>
      <div className={styles.desc}>{getEditorText(item.content)}</div>
    </div>
  )
}

export default DocumentCard;