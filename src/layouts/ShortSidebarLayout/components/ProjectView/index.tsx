import ProjectList from '@/layouts/ThreeColumnLayout/List/ProjectList/Project';
import EditProject from '@/layouts/ThreeColumnLayout/Content/Project';

import styles from './index.module.less';

const ProjectView = () => {
  return (
    <div className={styles.viewContainer}>
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