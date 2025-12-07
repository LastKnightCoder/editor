import { useState, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn } from "ahooks";
import { FloatButton, message } from "antd";
import { LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import { CaretRightOutlined } from "@ant-design/icons";
import useProjectsStore from "@/stores/useProjectsStore.ts";
import EditProjectInfoModal from "./EditProjectInfoModal";
import ProjectList from "./ProjectList";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";

import styles from "./index.module.less";
import { Descendant } from "slate";
import { CreateProject, EProjectType } from "@/types";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import classNames from "classnames";

const EMPTY_DESC: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const ProjectsView = () => {
  const [createOpen, setCreateOpen] = useState(false);

  const navigateTo = useTabStore((state) => state.navigateTo);

  const { init, projects, createProject, showArchived, loading } =
    useProjectsStore(
      useShallow((state) => ({
        init: state.init,
        loading: state.loading,
        projects: state.projects,
        createProject: state.createProject,
        showArchived: state.showArchived,
      })),
    );

  // 在数据库连接或切换时加载项目列表
  useDatabaseChangeEffect(() => {
    init();
  });

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

  const handleToggleArchived = useMemoizedFn((checked: boolean) => {
    useProjectsStore.setState({ showArchived: checked });
  });

  const handleCreateProject = useMemoizedFn(
    async (title: string, desc: Descendant[], projectType: EProjectType) => {
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
        projectType,
        dataTableId: 0,
      };

      try {
        const createdProject = await createProject(project);
        if (createdProject) {
          setCreateOpen(false);
          navigateTo(
            TabType.ProjectDetail,
            { id: createdProject.id },
            `项目 - ${createdProject.title || `#${createdProject.id}`}`,
          );
        } else {
          message.error("创建项目失败");
        }
      } catch (error) {
        message.error("创建项目失败");
      }
    },
  );

  if (loading) {
    return (
      <div className={styles.loading}>
        <LoadingOutlined spin />
      </div>
    );
  }

  return (
    <div className={styles.projectContainer}>
      <div className={styles.container}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.title}>活跃项目</div>
          </div>
          <ProjectList
            projects={activeProjects}
            addProject={() => {
              setCreateOpen(true);
            }}
          />
        </div>

        {archivedProjects.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div
                className={styles.titleWithIcon}
                onClick={() => handleToggleArchived(!showArchived)}
              >
                <div
                  className={classNames(styles.arrow, {
                    [styles.open]: showArchived,
                  })}
                >
                  <CaretRightOutlined />
                </div>
                <span>归档项目</span>
                <span className={styles.count}>
                  ({archivedProjects.length})
                </span>
              </div>
            </div>
            {showArchived && <ProjectList projects={archivedProjects} />}
          </div>
        )}
      </div>
      <FloatButton
        icon={<PlusOutlined />}
        tooltip={"新建项目"}
        onClick={() => {
          setCreateOpen(true);
        }}
        style={{
          position: "absolute",
          right: 20,
          bottom: 20,
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
