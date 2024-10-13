import { useParams } from 'react-router-dom';
import DocumentList from '@/layouts/ThreeColumnLayout/List/DocumentList';
import EditDocument from '@/layouts/ThreeColumnLayout/Content/Document';

import styles from './index.module.less';

const DocumentView = () => {
  const params = useParams();

  console.log(params);

  const documentId = Number(params.id);

  if (!documentId) return null;

  return (
    <div className={styles.viewContainer}>
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