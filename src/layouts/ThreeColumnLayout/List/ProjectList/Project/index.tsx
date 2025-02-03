import { useMemo } from "react";
import { Button, Empty } from "antd";

import useProjectsStore from "@/stores/useProjectsStore";

import ProjectItem from '../ProjectItem';
import If from "@/components/If";
import For from "@/components/For";

import styles from './index.module.less';
import { CreateProjectItem, EProjectItemType } from "@/types";

const Project = () => {
  const {
    projects,
    activeProjectId,
    createRootProjectItem
  } = useProjectsStore(state => ({
    projects: state.projects,
    activeProjectId: state.activeProjectId,
    createRootProjectItem: state.createRootProjectItem
  }));

  const project = useMemo(() => {
    return projects.find(p => p.id === activeProjectId);
  }, [projects, activeProjectId]);

  const onCreateRootProjectItem = async () => {
    if (!activeProjectId) return;
    const defaultRootProjectItem: CreateProjectItem = {
      title: '新文档',
      content: [{
        type: 'paragraph',
        children: [{
          type: 'formatted',
          text: '',
        }]
      }],
      children: [],
      parents: [],
      projects: [activeProjectId],
      refType: '',
      refId: 0,
      projectItemType: EProjectItemType.Document,
    }
    const item = await createRootProjectItem(activeProjectId, defaultRootProjectItem);
    if (item) {
      useProjectsStore.setState({
        activeProjectItemId: item.id,
      })
    }
  };

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
      <Button style={{ marginTop: 12 }} onClick={onCreateRootProjectItem}>新建文档</Button>
    </div>
  )
}

export default Project;
