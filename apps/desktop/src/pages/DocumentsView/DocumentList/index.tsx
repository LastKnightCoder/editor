import DocumentCard from "../DocumentCard";
import For from "@/components/For";
import { IDocument } from "@/types";

import styles from "./index.module.less";
import { Empty, Button } from "antd";

interface DocumentListProps {
  documents: IDocument[];
  addDocument: () => void;
}

const DocumentList = (props: DocumentListProps) => {
  const { documents, addDocument } = props;

  if (documents.length === 0) {
    return (
      <div className={styles.empty}>
        <Empty description="暂无知识库">
          <Button onClick={addDocument}>新建知识库</Button>
        </Empty>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <For
        data={documents}
        renderItem={(document: IDocument) => (
          <DocumentCard
            style={{ height: 160 }}
            key={document.id}
            document={document}
          />
        )}
      />
    </div>
  );
};

export default DocumentList;
