import TitlebarIcon from "@/components/TitlebarIcon";

import { PlusOutlined } from '@ant-design/icons';
import { MdExitToApp } from "react-icons/md";

import styles from './index.module.less';

interface IDocumentTitlebarProps {
  createDocument: () => Promise<void>;
  quitEditDocument: () => void;
}

const Document = (props: IDocumentTitlebarProps) => {
  const { createDocument, quitEditDocument } = props;

  return (
    <div className={styles.iconList}>
      <TitlebarIcon onClick={createDocument}>
        <PlusOutlined />
      </TitlebarIcon>
      <TitlebarIcon onClick={quitEditDocument}>
        <MdExitToApp />
      </TitlebarIcon>
    </div>
  )
}

export default Document;