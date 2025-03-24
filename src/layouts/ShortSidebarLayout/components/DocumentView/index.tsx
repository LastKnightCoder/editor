import { useParams } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import DocumentList from "./DocumentList";
import EditDocument from "@/layouts/components/EditDocumentItem";

import styles from "./index.module.less";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import classnames from "classnames";

const DocumentView = () => {
  const params = useParams();

  const documentId = Number(params.id);

  const { hideDocumentItemsList, activeDocumentItemId } = useDocumentsStore(
    useShallow((state) => ({
      hideDocumentItemsList: state.hideDocumentItemsList,
      activeDocumentItemId: state.activeDocumentItemId,
    })),
  );

  if (!documentId) return null;

  return (
    <div
      className={classnames(styles.viewContainer, {
        [styles.hideSidebar]: hideDocumentItemsList && !!activeDocumentItemId,
      })}
    >
      <div className={styles.sidebar}>
        <DocumentList />
      </div>
      <div className={styles.edit}>
        <EditDocument />
      </div>
    </div>
  );
};

export default DocumentView;
