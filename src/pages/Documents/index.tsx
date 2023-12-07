import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import isHotkey from "is-hotkey";

import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import Sidebar from './Sidebar';
import EditDoc from "./EditDoc";
import styles from './index.module.less';

const Documents = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
        setSidebarOpen(false);
      } else if (isHotkey('mod+right', event)) {
        setSidebarOpen(true);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [])

  return (
    <motion.div animate={sidebarOpen ? 'open' : 'close'} className={styles.documentContainer}>
      <motion.div  variants={sidebarVariants} className={styles.sidebar}>
        <Sidebar />
      </motion.div>
      <motion.div className={styles.content} layout layoutRoot>
        { activeDocumentItem && <EditDoc key={activeDocumentItem.id} /> }
      </motion.div>
    </motion.div>
  )
}

export default Documents;