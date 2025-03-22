import { memo } from "react";
import { useShallow } from "zustand/react/shallow";
import Document from "./Document";
import useDocumentsStore from "@/stores/useDocumentsStore";

import styles from "./index.module.less";

const DocumentList = memo(() => {
  const { documents, activeDocumentId } = useDocumentsStore(
    useShallow((state) => ({
      documents: state.documents,
      activeDocumentId: state.activeDocumentId,
    })),
  );

  const activeDocument = documents.find(
    (document) => document.id === activeDocumentId,
  );

  if (!activeDocument) return null;

  return (
    <div className={styles.documentList}>
      <Document document={activeDocument} />
    </div>
  );
});

export default DocumentList;
