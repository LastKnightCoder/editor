import { memo } from "react";
import Document from "./Document";
import { useParams } from "react-router-dom";

import styles from "./index.module.less";

const DocumentList = memo(() => {
  const { id } = useParams();

  return (
    <div className={styles.documentList}>
      <Document documentId={Number(id)} key={Number(id)} />
    </div>
  );
});

export default DocumentList;
