import { useParams, useNavigate } from "react-router-dom";
import DocumentList from "./DocumentList";
import EditDocument from "@/layouts/components/EditDocumentItem";

import styles from "./index.module.less";
import Titlebar from "@/layouts/components/Titlebar";
import { Breadcrumb } from "antd";

const DocumentView = () => {
  const params = useParams();

  const documentId = Number(params.id);

  const navigate = useNavigate();

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
          <EditDocument />
        </div>
      </div>
    </div>
  );
};

export default DocumentView;
