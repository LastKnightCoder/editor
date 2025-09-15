import For from "@/components/For";
import { Project } from "@/types";
import ProjectCard from "../ProjectCard";
import styles from "./index.module.less";
import { Empty, Button } from "antd";

interface ProjectListProps {
  projects: Project[];
  addProject?: () => void;
}

const ProjectList = (props: ProjectListProps) => {
  const { projects, addProject } = props;

  if (projects.length === 0) {
    return (
      <div className={styles.empty}>
        <Empty description="暂无项目">
          {addProject && <Button onClick={addProject}>新建项目</Button>}
        </Empty>
      </div>
    );
  }

  return (
    <div className={styles.projectGrid}>
      <For
        data={projects}
        renderItem={(project: Project) => (
          <ProjectCard
            key={project.id}
            project={project}
            style={{ height: 200 }}
          />
        )}
      />
    </div>
  );
};

export default ProjectList;
