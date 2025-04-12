import { useParams, useNavigate } from "react-router-dom";
import DocumentList from "./DocumentList";
import EditDocumentItem from "./EditDocumentItem";

import styles from "./index.module.less";
import Titlebar from "@/components/Titlebar";
import { Breadcrumb, Empty, Button } from "antd";
import useDocumentsStore from "@/stores/useDocumentsStore";
import { useMemo, useState, useEffect } from "react";
import { IDocument } from "@/types";
import { getDocument } from "@/commands";
import { LoadingOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import If from "@/components/If";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";

const DocumentView = () => {
  const params = useParams();

  const documentId = Number(params.id);
  const [document, setDocument] = useState<IDocument | null>(null);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  const activeDocumentItemId = useDocumentsStore(
    (state) => state.activeDocumentItemId,
  );

  const { hideDocumentItemsList } = useDocumentsStore((state) => ({
    hideDocumentItemsList: state.hideDocumentItemsList,
  }));

  const openSidebar = useMemoizedFn(() => {
    useDocumentsStore.setState({
      hideDocumentItemsList: false,
    });
  });

  useEffect(() => {
    setLoading(true);
    getDocument(documentId)
      .then((document) => {
        setDocument(document);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [documentId]);

  const breadcrumbItems = useMemo(() => {
    if (!document) return [];

    return [
      { title: "首页", path: "/" },
      { title: "知识库列表", path: "/documents/list" },
      {
        title: document.title,
        path: `/documents/detail/${document.id}`,
      },
    ];
  }, [document]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <LoadingOutlined />
      </div>
    );
  }

  if (!document) {
    return (
      <div className={styles.empty}>
        <Empty
          description="知识库不存在或已被删除"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button type="primary" onClick={() => navigate("/documents/list")}>
            返回知识库列表
          </Button>
        </Empty>
      </div>
    );
  }

  if (!document) return null;

  return (
    <div className={styles.viewContainer}>
      <div
        className={classnames(styles.sidebar, {
          [styles.hide]: hideDocumentItemsList,
        })}
      >
        <DocumentList />
      </div>
      <div className={styles.edit}>
        <Titlebar className={styles.titlebar}>
          <If condition={hideDocumentItemsList}>
            <div className={styles.openIndicator} onClick={openSidebar}>
              <MenuUnfoldOutlined />
            </div>
          </If>
          <Breadcrumb
            className={classnames(styles.breadcrumb, {
              [styles.showUnfold]: hideDocumentItemsList,
            })}
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
          <EditDocumentItem
            key={activeDocumentItemId}
            documentItemId={activeDocumentItemId ?? 0}
          />
        </div>
      </div>
    </div>
  );
};

export default DocumentView;
