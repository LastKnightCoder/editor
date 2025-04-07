import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn } from "ahooks";
import { FloatButton, message, Breadcrumb } from "antd";
import { LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import { CaretRightOutlined } from "@ant-design/icons";
import useProjectsStore from "@/stores/useProjectsStore.ts";
import EditProjectInfoModal from "./EditProjectInfoModal";
import ProjectList from "./ProjectList";

import styles from "./index.module.less";
import { Descendant } from "slate";
import { CreateProject } from "@/types";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import Titlebar from "@/components/Titlebar";
import classNames from "classnames";

const EMPTY_DESC: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const ProjectsView = () => {
  const [createOpen, setCreateOpen] = useState(false);

  const navigate = useNavigate();

  const isConnected = useDatabaseConnected();
  const database = useSettingStore((state) => state.setting.database.active);

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

  useEffect(() => {
    if (isConnected && database) {
      init();
    }
  }, [init, isConnected, database]);

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

      try {
        const createdProject = await createProject(project);
        if (createdProject) {
          setCreateOpen(false);
          navigate(`/projects/detail/${createdProject.id}`);
        } else {
          message.error("创建项目失败");
        }
      } catch (error) {
        message.error("创建项目失败");
      }
    },
  );

  // 面包屑导航
  const breadcrumbItems = [
    { title: "首页", path: "/" },
    { title: "项目列表", path: "/projects/list" },
  ];

  if (loading) {
    return (
      <div className={styles.loading}>
        <LoadingOutlined spin />
      </div>
    );
  }

  return (
    <div className={styles.projectContainer}>
      <Titlebar className={styles.titlebar}>
        <Breadcrumb
          className={styles.breadcrumb}
          items={breadcrumbItems.map((item) => ({
            title: (
              <span
                className={styles.breadcrumbItem}
                onClick={() => navigate(item.path)}
              >
                {item.title}
              </span>
            ),
          }))}
        />
      </Titlebar>
      <div className={styles.container}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.title}>活跃项目</div>
          </div>
          <ProjectList projects={activeProjects} />
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
