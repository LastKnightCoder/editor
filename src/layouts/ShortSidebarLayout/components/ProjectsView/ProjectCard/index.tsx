import React, { useState } from "react";
import { useNavigate } from 'react-router-dom';
import { Descendant } from "slate";
import { Modal, Popover } from "antd";
import classnames from "classnames";
import { produce } from "immer";

import { MdMoreVert } from "react-icons/md";
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
    updateProject
  } = useProjectsStore(state => ({
    deleteProject: state.deleteProject,
    updateProject: state.updateProject
  }));

  const onClick = () => {
    useProjectsStore.setState({
      activeProjectId: project.id
    });
    navigate(`/projects/${project.id}`);
  }

  const handleDeleteProject = () => {
    Modal.confirm({
      title: '确定删除该项目？',
      onOk: async () => {
        await deleteProject(project.id);
      },
      okText: '确定',
      cancelText: '取消',
      okButtonProps: {
        danger: true
      }
    });
    setSettingOpen(false);
  }

  const handleEditProject = async (title: string, desc: Descendant[]) => {
    const newProject = produce(project, draft => {
      draft.title = title;
      draft.desc = desc;
    });
    await updateProject(newProject);
    setEditOpen(false);
    navigate(`/projects/${project.id}`)
  }

  return (
    <div className={classnames(styles.cardContainer, { [styles.dark]: isDark }, className)} style={style}>
      <div className={styles.title} onClick={onClick}>
        {project.title}
      </div>
      <div className={styles.desc}>
        <Editor
          readonly
          className={styles.editor}
          initValue={project.desc}
        />
      </div>
      <div className={classnames(styles.operate)}>
        <Popover
          open={settingOpen}
          onOpenChange={setSettingOpen}
          placement={'bottomRight'}
          trigger={'click'}
          styles={{
            body: {
              padding: 4
            }
          }}
          content={(
            <div className={styles.settings}>
              <div className={styles.settingItem} onClick={handleDeleteProject}>删除项目</div>
              <div
                className={styles.settingItem}
                onClick={() => {
                  setEditOpen(true);
                  setSettingOpen(false);
                }}
              >
                编辑项目
              </div>
            </div>
          )}
        >
          <MdMoreVert/>
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
  )
}

export default ProjectCard;
