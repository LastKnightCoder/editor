import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { Descendant } from "slate";
import { Modal, Popover } from "antd";
import classnames from "classnames";
import { produce } from "immer";

import { MdMoreVert } from "react-icons/md";
import { FaArchive } from "react-icons/fa";
import { AiFillPushpin } from "react-icons/ai";
import useTheme from "@/hooks/useTheme.ts";
import { Project } from "@/types";
import Editor from "@editor/index.tsx";
import useProjectsStore from "@/stores/useProjectsStore.ts";
import EditProjectInfoModal from "@/layouts/components/EditProjectInfoModal";

import styles from "./index.module.less";

interface ProjectCardProps {
  project: Project;
  className?: string;
  style?: React.CSSProperties;
}

const ProjectCard = (props: ProjectCardProps) => {
  const { project, className, style } = props;
  const { isDark } = useTheme();

  const [settingOpen, setSettingOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const navigate = useNavigate();

  const {
    deleteProject,
    updateProject,
    archiveProject,
    unarchiveProject,
    pinProject,
    unpinProject,
  } = useProjectsStore(
    useShallow((state) => ({
      deleteProject: state.deleteProject,
      updateProject: state.updateProject,
      archiveProject: state.archiveProject,
      unarchiveProject: state.unarchiveProject,
      pinProject: state.pinProject,
      unpinProject: state.unpinProject,
    })),
  );

  const onClick = () => {
    navigate(`/projects/detail/${project.id}`);
  };

  const handleDeleteProject = () => {
    Modal.confirm({
      title: "确定删除该项目？",
      onOk: async () => {
        await deleteProject(project.id);
      },
      okText: "确定",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
    });
    setSettingOpen(false);
  };

  const handleEditProject = async (title: string, desc: Descendant[]) => {
    const newProject = produce(project, (draft) => {
      draft.title = title;
      draft.desc = desc;
    });
    await updateProject(newProject);
    setEditOpen(false);
    navigate(`/projects/${project.id}`);
  };

  const handleArchiveProject = async () => {
    await archiveProject(project.id);
    setSettingOpen(false);
  };

  const handleUnarchiveProject = async () => {
    await unarchiveProject(project.id);
    setSettingOpen(false);
  };

  const handlePinProject = async () => {
    await pinProject(project.id);
    setSettingOpen(false);
  };

  const handleUnpinProject = async () => {
    await unpinProject(project.id);
    setSettingOpen(false);
  };

  return (
    <div
      className={classnames(
        styles.cardContainer,
        { [styles.dark]: isDark },
        { [styles.archived]: project.archived },
        { [styles.pinned]: project.pinned },
        className,
      )}
      style={style}
      onClick={onClick}
    >
      {project.pinned && (
        <div className={styles.pinnedFlag}>
          <AiFillPushpin />
        </div>
      )}
      {project.archived && !project.pinned && (
        <div className={styles.archiveFlag}>
          <FaArchive />
        </div>
      )}
      <div className={styles.title}>{project.title}</div>
      <div className={styles.desc}>
        <Editor readonly className={styles.editor} initValue={project.desc} />
      </div>
      <div
        className={styles.operate}
        onClick={(e) => {
          e.stopPropagation();
          setSettingOpen(true);
        }}
      >
        <Popover
          open={settingOpen}
          onOpenChange={setSettingOpen}
          placement="bottomRight"
          content={
            <div className={styles.settings}>
              <div
                className={styles.settingItem}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditOpen(true);
                }}
              >
                编辑
              </div>
              <div
                className={styles.settingItem}
                onClick={(e) => {
                  e.stopPropagation();
                  project.pinned ? handleUnpinProject() : handlePinProject();
                }}
              >
                {project.pinned ? "取消置顶" : "置顶"}
              </div>
              <div
                className={styles.settingItem}
                onClick={(e) => {
                  e.stopPropagation();
                  project.archived
                    ? handleUnarchiveProject()
                    : handleArchiveProject();
                }}
              >
                {project.archived ? "取消归档" : "归档"}
              </div>
              <div
                className={styles.settingItem}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteProject();
                }}
              >
                删除
              </div>
            </div>
          }
          trigger="click"
        >
          <MdMoreVert />
        </Popover>
      </div>
      <EditProjectInfoModal
        open={editOpen}
        title={project.title}
        desc={project.desc}
        onCancel={() => setEditOpen(false)}
        onOk={handleEditProject}
      />
    </div>
  );
};

export default ProjectCard;
