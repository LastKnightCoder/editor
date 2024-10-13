import { useNavigate } from 'react-router-dom';
import TitlebarIcon from "@/components/TitlebarIcon";
import { HomeOutlined } from '@ant-design/icons';
import useProjectsStore from "@/stores/useProjectsStore.ts";

import styles from './index.module.less';

const ProjectTitlebar = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.iconList}>
      <TitlebarIcon
        tip={'主页'}
        onClick={() => {
          useProjectsStore.setState({
            activeProjectId: null,
            activeProjectItemId: null
          });
          navigate(`/projects/list`)
        }}
      >
        <HomeOutlined />
      </TitlebarIcon>
    </div>
  )
}

export default ProjectTitlebar;