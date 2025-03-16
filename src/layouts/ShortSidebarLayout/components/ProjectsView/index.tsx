import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMemoizedFn } from "ahooks";
import { FloatButton, message, Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { FaArchive } from "react-icons/fa";
import For from "@/components/For";
import ProjectCard from "./ProjectCard";
import useProjectsStore from "@/stores/useProjectsStore.ts";
import EditProjectInfoModal from "@/layouts/components/EditProjectInfoModal";
import useGridLayout from "@/hooks/useGridLayout";

import styles from "./index.module.less";
import { Descendant } from "slate";
import { CreateProject, Project } from "@/types";

const EMPTY_DESC: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const ProjectsView = () => {
  const { gridContainerRef, itemWidth, gap } = useGridLayout();
  const [createOpen, setCreateOpen] = useState(false);

  const navigate = useNavigate();

  const { projects, createProject, showArchived } = useProjectsStore(
    (state) => ({
      projects: state.projects,
      createProject: state.createProject,
      showArchived: state.showArchived,
    }),
  );

  const { activeProjects, archivedProjects } = useMemo(() => {
    return {
      activeProjects: projects
        .filter((project) => !project.archived)
        .sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return 0;
        }),
      archivedProjects: projects.filter((project) => project.archived),
    };
  }, [projects]);

  const handleToggleArchived = (checked: boolean) => {
    useProjectsStore.setState({ showArchived: checked });
  };

  const handleCreateProject = useMemoizedFn(
    async (title: string, desc: Descendant[]) => {
      if (!title) {
        message.error("请输入项目名称");
        return;
      }

      const project: CreateProject = {
        title,
        desc,
        children: [],
        archived: false,
        pinned: false,
      };

      const createdProject = await createProject(project);
      if (createdProject) {
        useProjectsStore.setState({
          activeProjectId: createdProject.id,
        });
        setCreateOpen(false);
        navigate(`/projects/${createdProject.id}`);
      } else {
        message.error("创建项目失败");
      }
    },
  );

  return (
    <div className={styles.container} ref={gridContainerRef} style={{ gap }}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.title}>活跃项目</div>
        </div>
        <div className={styles.projectGrid}>
          <For
            data={activeProjects}
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
      </div>

      {archivedProjects.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.titleWithIcon}>
              <FaArchive className={styles.icon} />
              <span>归档项目</span>
              <span className={styles.count}>({archivedProjects.length})</span>
            </div>
            <Button
              type="text"
              onClick={() => handleToggleArchived(!showArchived)}
            >
              {showArchived ? "隐藏" : "显示"}
            </Button>
          </div>
          {showArchived && (
            <div className={styles.projectGrid}>
              <For
                data={archivedProjects}
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
          )}
        </div>
      )}

      <FloatButton
        icon={<PlusOutlined />}
        tooltip={"新建项目"}
        onClick={() => {
          setCreateOpen(true);
        }}
      />
      <EditProjectInfoModal
        open={createOpen}
        title={""}
        desc={EMPTY_DESC}
        onOk={handleCreateProject}
        onCancel={() => setCreateOpen(false)}
      />
    </div>
  );
};

export default ProjectsView;
