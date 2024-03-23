import TitlebarIcon from "@/components/TitlebarIcon";

import { PlusOutlined } from '@ant-design/icons';
import { MdExitToApp } from "react-icons/md";
import { MdCenterFocusWeak } from "react-icons/md";

import useGlobalStateStore from "@/stores/useGlobalStateStore";

import styles from './index.module.less';

interface IDocumentTitlebarProps {
  createDocument: () => Promise<void>;
  quitEditDocument: () => void;
}

const Document = (props: IDocumentTitlebarProps) => {
  const { createDocument, quitEditDocument } = props;

  const {
    focusMode,
  } = useGlobalStateStore(state => ({
    focusMode: state.focusMode,
  }));

  return (
    <div className={styles.iconList}>
      <TitlebarIcon onClick={createDocument}>
        <PlusOutlined />
      </TitlebarIcon>
      <TitlebarIcon active={focusMode} onClick={() => {
        useGlobalStateStore.setState({
          focusMode: !focusMode,
        });
      }}>
        <MdCenterFocusWeak />
      </TitlebarIcon>
      <TitlebarIcon onClick={quitEditDocument}>
        <MdExitToApp />
      </TitlebarIcon>
    </div>
  )
}

export default Document;