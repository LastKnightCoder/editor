import { useEffect } from "react";
import isHotkey from "is-hotkey";

import { initAllDocumentItemParents } from"@/commands";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";

import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import Sidebar from './Sidebar';

import EditDoc from "./EditDoc";
import styles from './index.module.less';

const Documents = () => {
  const {
    activeDocumentItem,
  } = useDocumentsStore(state => ({
    activeDocumentItem: state.activeDocumentItem,
  }));

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      // mod + p
      if (isHotkey('mod+p', event)) {
        event.preventDefault();
        event.stopPropagation();
        await initAllDocumentItemParents();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

  useEffect(() => {
    return () => {
      useDocumentsStore.setState({
        activeDocumentId: null,
        activeDocumentItem: null,
      });
    }
  }, []);

  return (
    <div className={styles.documentContainer}>
      <ResizeableAndHideableSidebar className={styles.sidebar}>
        <Sidebar />
      </ResizeableAndHideableSidebar>
      <div className={styles.content}>
        { activeDocumentItem && <EditDoc key={activeDocumentItem.id} /> }
      </div>
    </div>
  )
}

export default Documents;