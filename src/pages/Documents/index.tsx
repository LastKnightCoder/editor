import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import Sidebar from './Sidebar';
import EditDoc from "./EditDoc";
import styles from './index.module.less';
import { useEffect } from "react";

const Documents = () => {
  const {
    init,
    activeDocumentItem,
  } = useDocumentsStore(state => ({
    init: state.init,
    activeDocumentItem: state.activeDocumentItem,
  }));

  useEffect(() => {
    init();

    return () => {
      useDocumentsStore.setState({
        activeDocumentId: null,
        activeDocumentItemId: null,
        activeDocumentItem: null,
        activeDocumentItemPath: [],
      });
    }
  }, [init]);

  return (
    <div className={styles.documentContainer}>
      <div className={styles.sidebar}>
        <Sidebar />
      </div>
      <div className={styles.content}>
        { activeDocumentItem && <EditDoc key={activeDocumentItem.id} /> }
      </div>
    </div>
  )
}

export default Documents;