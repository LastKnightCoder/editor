import { memo } from "react";
import Document from "./Document";
import useTabParams from "@/hooks/useTabParams";
import { TabType } from "@/types/tab";

import styles from "./index.module.less";

const DocumentList = memo(() => {
  const { id } = useTabParams(TabType.DocumentDetail);

  return (
    <div className={styles.documentList}>
      <Document documentId={Number(id)} key={Number(id)} />
    </div>
  );
});

export default DocumentList;
