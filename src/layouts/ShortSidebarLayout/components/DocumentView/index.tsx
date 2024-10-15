import { useParams } from 'react-router-dom';
import DocumentList from '@/layouts/ThreeColumnLayout/List/DocumentList';
import EditDocument from '@/layouts/ThreeColumnLayout/Content/Document';

import styles from './index.module.less';
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import classnames from "classnames";

const DocumentView = () => {
  const params = useParams();

  const documentId = Number(params.id);

  const {
    hideDocumentItemsList,
    activeDocumentItem
  } = useDocumentsStore(state => ({
    hideDocumentItemsList: state.hideDocumentItemsList,
    activeDocumentItem: state.activeDocumentItem
  }))

  if (!documentId) return null;

  return (
    <div className={classnames(styles.viewContainer, { [styles.hideSidebar]: hideDocumentItemsList && !! activeDocumentItem })}>
      <div className={styles.sidebar}>
        <DocumentList />
      </div>
      <div className={styles.edit}>
        <EditDocument />
      </div>
    </div>
  )
}

export default DocumentView;