import { useEffect } from "react";
import isHotkey from "is-hotkey";

import { initAllDocumentItemParents } from"@/commands";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import useDragAndHideSidebar from "@/hooks/useDragAndHideSidebar.ts";

import WidthResizable from "@/components/WidthResizable";
import Sidebar from './Sidebar';

import EditDoc from "./EditDoc";
import styles from './index.module.less';

const Documents = () => {
  const scope = useDragAndHideSidebar();

  const {
    activeDocumentItem,
  } = useDocumentsStore(state => ({
    activeDocumentItem: state.activeDocumentItem,
  }));

  const {
    sidebarWidth,
  } = useGlobalStateStore(state => ({
    sidebarWidth: state.sidebarWidth,
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
      <div ref={scope} className={styles.sidebar}>
        <WidthResizable
          defaultWidth={sidebarWidth}
          minWidth={200}
          maxWidth={500}
          onResize={(width) => {
            useGlobalStateStore.setState({
              sidebarWidth: width,
            });
            localStorage.setItem('sidebarWidth', String(sidebarWidth));
          }}
          style={{
            height: '100%'
          }}
        >
          <Sidebar />
        </WidthResizable>
      </div>
      <div className={styles.content}>
        { activeDocumentItem && <EditDoc key={activeDocumentItem.id} /> }
      </div>
    </div>
  )
}

export default Documents;