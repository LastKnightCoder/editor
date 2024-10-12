import { PlusOutlined } from '@ant-design/icons';
import { MdExitToApp } from "react-icons/md";
import TitlebarIcon from "@/components/TitlebarIcon";
import FocusMode from "../../../../components/FocusMode";

import styles from './index.module.less';
import useDocumentsStore from '@/stores/useDocumentsStore';
import { useMemoizedFn } from 'ahooks';
import { createDocumentItem } from '@/commands';
import { DEFAULT_CREATE_DOCUMENT_ITEM } from '@/constants';

const Document = () => {
  const {
    addDocumentItem,
    activeDocumentId,
  } = useDocumentsStore(state => ({
    addDocumentItem: state.addDocumentItem,
    activeDocumentId: state.activeDocumentId,
  }));

  const createDocument = useMemoizedFn(async () => {
    if (!activeDocumentId) return;
    const itemId = await createDocumentItem(DEFAULT_CREATE_DOCUMENT_ITEM);
    addDocumentItem(activeDocumentId, itemId);
  });

  const quitEditDocument = useMemoizedFn(() => {
    if (!activeDocumentId) return;
    useDocumentsStore.setState({
      activeDocumentId: null,
      activeDocumentItem: null,
    })
  });

  return (
    <div className={styles.iconList}>
      <TitlebarIcon onClick={createDocument}>
        <PlusOutlined />
      </TitlebarIcon>
      <FocusMode />
      <TitlebarIcon onClick={quitEditDocument}>
        <MdExitToApp />
      </TitlebarIcon>
    </div>
  )
}

export default Document;