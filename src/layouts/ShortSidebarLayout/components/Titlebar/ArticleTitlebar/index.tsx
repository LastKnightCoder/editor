import { useNavigate } from "react-router-dom";
import TitlebarIcon from "@/components/TitlebarIcon";
import { HomeOutlined, MenuUnfoldOutlined } from "@ant-design/icons";

import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";

import styles from "./index.module.less";

const ArticleTitlebar = () => {
  const navigate = useNavigate();

  const { activeArticleId, hideArticleList } = useArticleManagementStore(
    (state) => ({
      activeArticleId: state.activeArticleId,
      hideArticleList: state.hideArticleList,
    }),
  );

  return (
    <div className={styles.iconList}>
      {activeArticleId && hideArticleList && (
        <>
          <TitlebarIcon
            tip={"主页"}
            onClick={() => {
              useArticleManagementStore.setState({
                activeArticleId: undefined,
              });
              navigate(`/articles`);
            }}
          >
            <HomeOutlined />
          </TitlebarIcon>
          <TitlebarIcon
            onClick={() => {
              useArticleManagementStore.setState({
                hideArticleList: false,
              });
            }}
          >
            <MenuUnfoldOutlined />
          </TitlebarIcon>
        </>
      )}
    </div>
  );
};

export default ArticleTitlebar;
