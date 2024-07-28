import { PlusOutlined } from '@ant-design/icons';
import { MdExitToApp } from "react-icons/md";
import TitlebarIcon from "@/components/TitlebarIcon";
import ListOpen from '../components/ListOpen';
import FocusMode from "../components/FocusMode";

import styles from './index.module.less';

interface IDocumentTitlebarProps {
  createDocument: () => Promise<void>;
  quitEditDocument: () => void;
}

const Document = (props: IDocumentTitlebarProps) => {
  const { createDocument, quitEditDocument } = props;

  return (
    <div className={styles.iconList}>
      <ListOpen />
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