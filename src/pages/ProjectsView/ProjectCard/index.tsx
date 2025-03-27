import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { Descendant } from "slate";
import { Modal, Dropdown } from "antd";
import classnames from "classnames";
import { produce } from "immer";

import { MdMoreVert } from "react-icons/md";
import { FaArchive } from "react-icons/fa";
import { AiFillPushpin } from "react-icons/ai";
import useTheme from "@/hooks/useTheme.ts";
import { Project } from "@/types";
import Editor, { EditorRef } from "@editor/index.tsx";
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
  const editorRef = useRef<EditorRef>(null);

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
  };

  const handleEditProject = async (title: string, desc: Descendant[]) => {
    const newProject = produce(project, (draft) => {
      draft.title = title;
      draft.desc = desc;
    });
    await updateProject(newProject);
    setEditOpen(false);
    editorRef.current?.setEditorValue(desc);
  };

  const handleArchiveProject = async () => {
    await archiveProject(project.id);
  };

  const handleUnarchiveProject = async () => {
    await unarchiveProject(project.id);
  };

  const handlePinProject = async () => {
    await pinProject(project.id);
  };

  const handleUnpinProject = async () => {
    await unpinProject(project.id);
  };

  const menuItems = [
    {
      key: "edit",
      label: "编辑",
      onClick: () => setEditOpen(true),
    },
    {
      key: "pin",
      label: project.pinned ? "取消置顶" : "置顶",
      onClick: () =>
        project.pinned ? handleUnpinProject() : handlePinProject(),
    },
    {
      key: "archive",
      label: project.archived ? "取消归档" : "归档",
      onClick: () =>
        project.archived ? handleUnarchiveProject() : handleArchiveProject(),
    },
    {
      key: "delete",
      label: "删除",
      onClick: handleDeleteProject,
    },
  ];

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
        <Editor
          ref={editorRef}
          readonly
          className={styles.editor}
          initValue={project.desc}
        />
      </div>
      <div
        className={styles.operate}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <Dropdown
          menu={{ items: menuItems }}
          trigger={["hover"]}
          placement="bottomRight"
        >
          <MdMoreVert />
        </Dropdown>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <EditProjectInfoModal
          open={editOpen}
          title={project.title}
          desc={project.desc}
          onCancel={() => setEditOpen(false)}
          onOk={handleEditProject}
        />
      </div>
    </div>
  );
};

export default ProjectCard;
