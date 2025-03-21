import { useNavigate } from "react-router-dom";
import TitlebarIcon from "@/components/TitlebarIcon";
import { HomeOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import useProjectsStore from "@/stores/useProjectsStore.ts";

import styles from "./index.module.less";

const ProjectTitlebar = () => {
  const navigate = useNavigate();

  const { activeProjectId, activeProjectItemId, hideProjectItemList } =
    useProjectsStore((state) => ({
      activeProjectId: state.activeProjectId,
      activeProjectItemId: state.activeProjectItemId,
      hideProjectItemList: state.hideProjectItemList,
    }));

  return (
    <div className={styles.iconList}>
      {activeProjectId && hideProjectItemList && (
        <TitlebarIcon
          tip={"主页"}
          onClick={() => {
            useProjectsStore.setState({
              activeProjectId: null,
              activeProjectItemId: null,
              hideProjectItemList: false,
            });
            navigate(`/projects/list`);
          }}
        >
          <HomeOutlined />
        </TitlebarIcon>
      )}
      {activeProjectItemId && hideProjectItemList && (
        <TitlebarIcon
          onClick={() => {
            useProjectsStore.setState({
              hideProjectItemList: false,
            });
          }}
        >
          <MenuUnfoldOutlined />
        </TitlebarIcon>
      )}
    </div>
  );
};

export default ProjectTitlebar;
