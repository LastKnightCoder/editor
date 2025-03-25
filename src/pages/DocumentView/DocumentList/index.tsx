import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import Document from "./Document";
import useDocumentsStore from "@/stores/useDocumentsStore";
import { useParams } from "react-router-dom";

import styles from "./index.module.less";

const DocumentList = memo(() => {
  const { id } = useParams();
  const { documents } = useDocumentsStore(
    useShallow((state) => ({
      documents: state.documents,
    })),
  );

  const activeDocument = documents.find(
    (document) => document.id === Number(id),
  );

  if (!activeDocument) return null;

  return (
    <div className={styles.documentList}>
      <Document document={activeDocument} />
    </div>
  );
});

export default DocumentList;
