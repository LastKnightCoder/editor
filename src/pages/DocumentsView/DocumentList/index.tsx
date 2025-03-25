import DocumentCard from "../DocumentCard";
import For from "@/components/For";
import useGridLayout from "@/hooks/useGridLayout";
import { IDocument } from "@/types";

import styles from "./index.module.less";

interface DocumentListProps {
  documents: IDocument[];
}

const DocumentList = (props: DocumentListProps) => {
  const { documents } = props;

  const { gridContainerRef, itemWidth, gap } = useGridLayout();

  return (
    <div className={styles.container} ref={gridContainerRef} style={{ gap }}>
      <For
        data={documents}
        renderItem={(document: IDocument) => (
          <DocumentCard
            style={{ width: itemWidth, height: 160 }}
            key={document.id}
            document={document}
          />
        )}
      />
    </div>
  );
};

export default DocumentList;
