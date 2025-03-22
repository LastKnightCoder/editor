import ProjectList from "./ProjectList";
import classnames from "classnames";
import { useShallow } from "zustand/react/shallow";
import useProjectsStore from "@/stores/useProjectsStore.ts";

import EditProjectView from "./EditProjectView";
import styles from "./index.module.less";

const ProjectView = () => {
  const { activeProjectItemId, hideProjectItemList } = useProjectsStore(
    useShallow((state) => ({
      activeProjectItemId: state.activeProjectItemId,
      hideProjectItemList: state.hideProjectItemList,
    })),
  );

  return (
    <div
      className={classnames(styles.viewContainer, {
        [styles.hideSidebar]: activeProjectItemId && hideProjectItemList,
      })}
    >
      <div className={styles.sidebar}>
        <ProjectList />
      </div>
      <div className={styles.edit}>
        <EditProjectView />
      </div>
    </div>
  );
};

export default ProjectView;
