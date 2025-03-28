import { memo, useState } from "react";
import Document from "./Document";
import { useParams } from "react-router-dom";
import { useEffect } from "react";
import { getDocument } from "@/commands";
import { IDocument } from "@/types";

import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";

const DocumentList = memo(() => {
  const { id } = useParams();

  const [document, setDocument] = useState<IDocument | null>(null);

  useEffect(() => {
    getDocument(Number(id)).then((res) => {
      setDocument(res);
    });
  }, [id]);

  const refreshDocument = useMemoizedFn(() => {
    getDocument(Number(id)).then((res) => {
      setDocument(res);
    });
  });

  if (!document) return null;

  return (
    <div className={styles.documentList}>
      <Document document={document} refreshDocument={refreshDocument} />
    </div>
  );
});

export default DocumentList;
