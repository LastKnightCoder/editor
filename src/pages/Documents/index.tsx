import { useEffect } from "react";
import { motion } from "framer-motion";
import isHotkey from "is-hotkey";

import { initAllDocumentItemParents } from"@/commands";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";

import WidthResizable from "@/components/WidthResizable";
import Sidebar from './Sidebar';
import EditDoc from "./EditDoc";
import styles from './index.module.less';

const Documents = () => {
  const {
    activeDocumentItem,
  } = useDocumentsStore(state => ({
    activeDocumentItem: state.activeDocumentItem,
  }));

  const {
    sidebarOpen,
    sidebarWidth,
  } = useGlobalStateStore(state => ({
    sidebarOpen: state.sidebarOpen,
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

  const sidebarVariants = {
    open: {
      width: sidebarWidth,
    },
    close: {
      width: 0,
    }
  }

  return (
    <motion.div animate={sidebarOpen ? 'open' : 'close'} className={styles.documentContainer}>
      <motion.div initial={false} style={{ flexBasis: sidebarWidth }} variants={sidebarVariants} className={styles.sidebar}>
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
      </motion.div>
      <motion.div initial={false} className={styles.content} layout layoutRoot>
        { activeDocumentItem && <EditDoc key={activeDocumentItem.id} /> }
      </motion.div>
    </motion.div>
  )
}

export default Documents;