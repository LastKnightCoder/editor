import { useMemo } from "react";
import { Empty } from "antd";

import useProjectsStore from "@/stores/useProjectsStore";

import ProjectItem from '../ProjectItem';
import If from "@/components/If";
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
      <If condition={project.children.length === 0}>
        <Empty description={'项目下暂无文档'} />
      </If>
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