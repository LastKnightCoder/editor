import DocumentCard from "../DocumentCard";
import For from "@/components/For";
import useGridLayout from "@/hooks/useGridLayout";
import { IDocument } from "@/types";

import styles from "./index.module.less";
import { Empty, Button } from "antd";

interface DocumentListProps {
  documents: IDocument[];
  addDocument: () => void;
}

const DocumentList = (props: DocumentListProps) => {
  const { documents, addDocument } = props;

  const { gridContainerRef, itemWidth, gap } = useGridLayout();

  if (documents.length === 0) {
    return (
      <div ref={gridContainerRef} className={styles.empty}>
        <Empty description="暂无知识库">
          <Button onClick={addDocument}>新建知识库</Button>
        </Empty>
      </div>
    );
  }

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
