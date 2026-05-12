import { useState, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn } from "ahooks";
import { message } from "antd";
import {
  LoadingOutlined,
  PlusOutlined,
  FileTextOutlined,
  TableOutlined,
  ExperimentOutlined,
} from "@ant-design/icons";
import { CaretRightOutlined } from "@ant-design/icons";
import useProjectsStore from "@/stores/useProjectsStore.ts";
import EditProjectInfoModal from "./EditProjectInfoModal";
import ProjectList from "./ProjectList";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import For from "@/components/For";

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
  const [isAddMenuHovered, setIsAddMenuHovered] = useState(false);
  const [selectedProjectType, setSelectedProjectType] = useState<EProjectType>(
    EProjectType.DocumentTree,
  );

  const isAddMenuOpen = isAddMenuHovered;

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

  const addActionItems = useMemo(
    () => [
      {
        key: EProjectType.DocumentTree,
        label: "文档树项目",
        description: "以文档树形式组织内容",
        icon: <FileTextOutlined />,
      },
      {
        key: EProjectType.DataTable,
        label: "数据表格项目",
        description: "使用表格管理结构化数据",
        icon: <TableOutlined />,
      },
      {
        key: EProjectType.VibeLearning,
        label: "Vibe Learning",
        description: "沉浸式学习项目",
        icon: <ExperimentOutlined />,
      },
    ],
    [],
  );

  const handleAddMenuAction = useMemoizedFn((projectType: EProjectType) => {
    setIsAddMenuHovered(false);
    setSelectedProjectType(projectType);
    setCreateOpen(true);
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
      <div
        className={`${styles.addActionDock} ${
          isAddMenuOpen ? styles.addActionDockOpen : ""
        }`}
        onMouseEnter={() => setIsAddMenuHovered(true)}
        onMouseLeave={() => setIsAddMenuHovered(false)}
      >
        <div
          className={`${styles.addActionMenu} ${
            isAddMenuOpen ? styles.addActionMenuOpen : ""
          }`}
          role="menu"
          aria-hidden={!isAddMenuOpen}
        >
          <For
            data={addActionItems}
            renderItem={(item) => (
              <button
                key={item.key}
                type="button"
                className={styles.addActionItem}
                onClick={() => handleAddMenuAction(item.key)}
                role="menuitem"
              >
                <span className={styles.addActionItemIcon}>{item.icon}</span>
                <span className={styles.addActionItemBody}>
                  <span className={styles.addActionItemTitle}>
                    {item.label}
                  </span>
                  <span className={styles.addActionItemDescription}>
                    {item.description}
                  </span>
                </span>
              </button>
            )}
          />
        </div>

        <button
          type="button"
          className={`${styles.addActionButton} ${
            isAddMenuOpen ? styles.addActionButtonActive : ""
          }`}
          aria-label="新建项目"
          aria-haspopup="menu"
          aria-expanded={isAddMenuOpen}
        >
          <PlusOutlined />
        </button>
      </div>
      <EditProjectInfoModal
        open={createOpen}
        title={""}
        desc={EMPTY_DESC}
        defaultProjectType={selectedProjectType}
        onOk={handleCreateProject}
        onCancel={() => setCreateOpen(false)}
      />
    </div>
  );
};

export default ProjectsView;
