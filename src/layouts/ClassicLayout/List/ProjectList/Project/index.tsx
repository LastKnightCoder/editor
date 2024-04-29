import { useMemo } from "react";

import useProjectsStore from "@/stores/useProjectsStore";

import ProjectItem from '../ProjectItem';
import For from "@/components/For";

import styles from './index.module.less';

const Project = () => {
  const {
    projects,
    activateProjectId,
  } = useProjectsStore(state => ({
    projects: state.projects,
    activateProjectId: state.activeProjectId
  }));

  const project = useMemo(() => {
    return projects.find(p => p.id === activateProjectId);
  }, [projects, activateProjectId]);

  if (!project) return null;

  return (
    <div className={styles.list}>
      <For
        data={project.children}
        renderItem={(projectItemId, index) => (
          <ProjectItem
            projectItemId={projectItemId}
            isRoot
            key={projectItemId}
            path={[index]}
            parentProjectItemId={project.id}
            parentChildren={project.children}
          />
        )}
      />
    </div>
  )
}

export default Project;