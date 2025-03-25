import For from "@/components/For";
import { Project } from "@/types";
import ProjectCard from "../ProjectCard";
import useGridLayout from "@/hooks/useGridLayout";
import { useRef } from "react";
import styles from "./index.module.less";

interface ProjectListProps {
  projects: Project[];
}

const ProjectList = (props: ProjectListProps) => {
  const { projects } = props;

  const gridContainerRef = useRef<HTMLDivElement>(null);

  const { itemWidth, gap } = useGridLayout();

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
