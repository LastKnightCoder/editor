import For from "@/components/For";
import { Project } from "@/types";
import ProjectCard from "../ProjectCard";
import useGridLayout from "@/hooks/useGridLayout";
import styles from "./index.module.less";
import { Empty, Button } from "antd";

interface ProjectListProps {
  projects: Project[];
  addProject?: () => void;
}

const ProjectList = (props: ProjectListProps) => {
  const { projects, addProject } = props;

  const { itemWidth, gap, gridContainerRef } = useGridLayout();

  if (projects.length === 0) {
    return (
      <div ref={gridContainerRef} className={styles.empty}>
        <Empty description="暂无项目">
          {addProject && <Button onClick={addProject}>新建项目</Button>}
        </Empty>
      </div>
    );
  }

  return (
    <div className={styles.projectGrid} ref={gridContainerRef} style={{ gap }}>
      <For
        data={projects}
        renderItem={(project: Project) => (
          <ProjectCard
            key={project.id}
            project={project}
            style={{
              width: itemWidth,
              height: 200,
            }}
          />
        )}
      />
    </div>
  );
};

export default ProjectList;
