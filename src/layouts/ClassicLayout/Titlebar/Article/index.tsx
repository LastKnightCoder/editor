import TitlebarIcon from "@/components/TitlebarIcon";
import { Tooltip } from "antd";

import useGlobalStateStore from "@/stores/useGlobalStateStore";

import { EditOutlined, ReadOutlined, PlusOutlined } from '@ant-design/icons';
import { MdOutlineFavoriteBorder, MdExitToApp, MdOutlineDeleteOutline, MdCenterFocusWeak } from "react-icons/md";

import styles from './index.module.less';

interface IArticleTitlebarProps {
  readonly: boolean;
  isTop: boolean;
  quitEdit: () => void;
  toggleIsTop: () => void;
  toggleReadOnly: () => void;
  createArticle: () => void;
  deleteArticle: () => void;
}

const Article = (props: IArticleTitlebarProps) => {
  const { readonly, isTop, quitEdit, toggleIsTop, toggleReadOnly, createArticle, deleteArticle } = props;

  const {
    focusMode,
  } = useGlobalStateStore(state => ({
    focusMode: state.focusMode,
  }))

  return (
    <div className={styles.iconList}>
      <TitlebarIcon onClick={createArticle}>
        <PlusOutlined />
      </TitlebarIcon>
      <TitlebarIcon active={focusMode} onClick={() => {
        useGlobalStateStore.setState({
          focusMode: !focusMode,
        });
      }}>
        <MdCenterFocusWeak />
      </TitlebarIcon>
      <TitlebarIcon onClick={toggleReadOnly}>
        <Tooltip title={readonly ? '编辑' : '阅读'}>
          { readonly ? <EditOutlined /> : <ReadOutlined /> }
        </Tooltip>
      </TitlebarIcon>
      <TitlebarIcon active={isTop} onClick={toggleIsTop}>
        <MdOutlineFavoriteBorder />
      </TitlebarIcon>
      <TitlebarIcon onClick={quitEdit}>
        <MdExitToApp />
      </TitlebarIcon>
      <TitlebarIcon onClick={deleteArticle}>
        <MdOutlineDeleteOutline />
      </TitlebarIcon>
    </div>
  )
}

export default Article;