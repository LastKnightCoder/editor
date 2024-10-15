import { useNavigate } from 'react-router-dom';
import TitlebarIcon from "@/components/TitlebarIcon";
import { HomeOutlined } from '@ant-design/icons';
import { FiSidebar } from "react-icons/fi";

import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";

import styles from './index.module.less';

const ArticleTitlebar = () => {
  const navigate = useNavigate();

  const {
    activeArticleId
  } = useArticleManagementStore(state => ({
    activeArticleId: state.activeArticleId
  }))

  return (
    <div className={styles.iconList}>
      {
        activeArticleId && (
          <>
            <TitlebarIcon
              tip={'主页'}
              onClick={() => {
                useArticleManagementStore.setState({
                  activeArticleId: undefined,
                });
                navigate(`/articles`)
              }}
            >
              <HomeOutlined />
            </TitlebarIcon>
            <TitlebarIcon
              onClick={() => {
                const hideArticleList = useArticleManagementStore.getState().hideArticleList
                useArticleManagementStore.setState({
                  hideArticleList: !hideArticleList
                })
              }}
            >
              <FiSidebar />
            </TitlebarIcon>
          </>
        )
      }

    </div>
  )
}

export default ArticleTitlebar;