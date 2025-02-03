import ProjectList from '@/layouts/ThreeColumnLayout/List/ProjectList/Project';
import classnames from "classnames";
import useProjectsStore from "@/stores/useProjectsStore.ts";

import EditProjectView from './EditProjectView';
import styles from './index.module.less';

const ProjectView = () => {
  const {
    activeProjectItemId,
    hideProjectItemList
  } = useProjectsStore(state => ({
    activeProjectItemId: state.activeProjectItemId,
    hideProjectItemList: state.hideProjectItemList
  }));

  return (
    <div className={classnames(styles.viewContainer, { [styles.hideSidebar]: activeProjectItemId && hideProjectItemList })}>
      <div className={styles.sidebar}>
        <ProjectList />
      </div>
      <div className={styles.edit}>
        <EditProjectView />
      </div>
    </div>
  )
}

export default ProjectView;