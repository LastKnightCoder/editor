import useProjectsStore from "@/stores/useProjectsStore";
import If from "@/components/If";
import { Empty } from "antd";
import For from "@/components/For";
import Editor from "@/components/Editor";

import styles from './index.module.less';
import { useMemoizedFn } from "ahooks";
import { Project } from "@/types";
import Tags from "@/components/Tags";
import { formatDate } from '@/utils/time'

const Projects = () => {
  const {
    projects,
  } = useProjectsStore(state => ({
    projects: state.projects,
  }));

  const handleClickProject = useMemoizedFn((project: Project) => {
    useProjectsStore.setState({
      activeProjectId: project.id,
    })
  })

  return (
    <div className={styles.list}>
      <If condition={projects.length === 0}>
        <Empty description="暂无项目" />
      </If>
      <For
        data={projects}
        renderItem={project => (
          <div
            className={styles.project}
            key={project.id}
            onClick={() => handleClickProject(project)}
          >
            <div className={styles.title}>{project.title}</div>
            <Editor
              readonly
              className={styles.editor}
              initValue={project.desc}
            />
            <Tags tags={[`更新时间：${formatDate(project.updateTime, true)}`]} />
          </div>
        )}
      />
    </div>
  )
}

export default Projects;