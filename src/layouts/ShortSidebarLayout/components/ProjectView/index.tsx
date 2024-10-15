import ProjectList from '@/layouts/ThreeColumnLayout/List/ProjectList/Project';
import EditProject from '@/layouts/ThreeColumnLayout/Content/Project';

import styles from './index.module.less';
import classnames from "classnames";
import useProjectsStore from "@/stores/useProjectsStore.ts";

const ProjectView = () => {
  const {
    activeProjectItemId,
    hideProjectItemList
  } = useProjectsStore(state => ({
    activeProjectItemId: state.activeProjectItemId,
    hideProjectItemList: state.hideProjectItemList
  }))

  return (
    <div className={classnames(styles.viewContainer, { [styles.hideSidebar]: activeProjectItemId && hideProjectItemList })}>
      <div className={styles.sidebar}>
        <ProjectList />
      </div>
      <div className={styles.edit}>
        <EditProject />
      </div>
    </div>
  )
}

export default ProjectView;