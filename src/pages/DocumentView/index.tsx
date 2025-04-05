import { useParams, useNavigate } from "react-router-dom";
import DocumentList from "./DocumentList";
import EditDocumentItem from "./EditDocumentItem";

import styles from "./index.module.less";
import Titlebar from "@/components/Titlebar";
import { Breadcrumb } from "antd";
import useDocumentsStore from "@/stores/useDocumentsStore";

const DocumentView = () => {
  const params = useParams();

  const documentId = Number(params.id);

  const navigate = useNavigate();

  const activeDocumentItemId = useDocumentsStore(
    (state) => state.activeDocumentItemId,
  );

  if (!documentId) return null;

  const breadcrumbItems = [
    { title: "首页", path: "/" },
    { title: "知识库列表", path: "/documents/list" },
    {
      title: `知识库详情 #${documentId}`,
      path: `/documents/detail/${documentId}`,
    },
  ];

  return (
    <div className={styles.viewContainer}>
      <div className={styles.sidebar}>
        <DocumentList />
      </div>
      <div className={styles.edit}>
        <Titlebar className={styles.titlebar}>
          <Breadcrumb
            className={styles.breadcrumb}
            items={breadcrumbItems.map((item) => ({
              title: (
                <span
                  className={styles.breadcrumbItem}
                  onClick={() => navigate(item.path)}
                >
                  {item.title}
                </span>
              ),
            }))}
          />
        </Titlebar>
        <div className={styles.editorContainer}>
          <EditDocumentItem key={activeDocumentItemId} />
        </div>
      </div>
    </div>
  );
};

export default DocumentView;
