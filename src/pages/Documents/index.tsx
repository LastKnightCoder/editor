import { useEffect } from "react";
import { motion } from "framer-motion";
import isHotkey from "is-hotkey";

import { initAllDocumentItemParents } from"@/commands";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
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
    sidebarOpen
  } = useGlobalStateStore(state => ({
    sidebarOpen: state.sidebarOpen,
  }));

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      // mod + p
      if (isHotkey('mod+p', event)) {
        event.preventDefault();
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
      width: 280,
    },
    close: {
      width: 0,
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isHotkey('mod+left', event)) {
        useGlobalStateStore.setState({
          sidebarOpen: false,
        })
      } else if (isHotkey('mod+right', event)) {
        useGlobalStateStore.setState({
          sidebarOpen: true,
        })
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [])

  return (
    <motion.div animate={sidebarOpen ? 'open' : 'close'} className={styles.documentContainer}>
      <motion.div initial={false}  variants={sidebarVariants} className={styles.sidebar}>
        <Sidebar />
      </motion.div>
      <motion.div initial={false} className={styles.content} layout layoutRoot>
        { activeDocumentItem && <EditDoc key={activeDocumentItem.id} /> }
      </motion.div>
    </motion.div>
  )
}

export default Documents;