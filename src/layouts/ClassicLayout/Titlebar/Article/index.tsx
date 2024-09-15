import TitlebarIcon from "@/components/TitlebarIcon";
import ListOpen from '../components/ListOpen';
import FocusMode from "../components/FocusMode";

import { EditOutlined, ReadOutlined, PlusOutlined } from '@ant-design/icons';
import { MdOutlineFavoriteBorder, MdExitToApp, MdOutlineDeleteOutline } from "react-icons/md";

import styles from './index.module.less';

interface IArticleTitlebarProps {
  readonly: boolean;
  isTop: boolean;
  hasActiveArticle: boolean;
  quitEdit: () => void;
  toggleIsTop: () => void;
  toggleReadOnly: () => void;
  createArticle: () => void;
  deleteArticle: () => void;
}

const Article = (props: IArticleTitlebarProps) => {
  const { readonly, isTop, quitEdit, toggleIsTop, toggleReadOnly, createArticle, deleteArticle,hasActiveArticle } = props;

  return (
    <div className={styles.iconList}>
      <ListOpen />
      <TitlebarIcon onClick={createArticle} tip={'新建文章'}>
        <PlusOutlined />
      </TitlebarIcon>
      <FocusMode />
      {
        hasActiveArticle && (
          <>
            <TitlebarIcon onClick={toggleReadOnly} tip={readonly ? '切换编辑' : '切换只读'}>
              { readonly ? <EditOutlined /> : <ReadOutlined /> }
            </TitlebarIcon>
            <TitlebarIcon active={isTop} onClick={toggleIsTop} tip={isTop ? '取消置顶' : '置顶'}>
              <MdOutlineFavoriteBorder />
            </TitlebarIcon>
            <TitlebarIcon onClick={quitEdit} tip={'退出编辑'}>
              <MdExitToApp />
            </TitlebarIcon>
            <TitlebarIcon onClick={deleteArticle} tip={'删除文章'}>
              <MdOutlineDeleteOutline />
            </TitlebarIcon>
          </>
        )
      }
    </div>
  )
}

export default Article;