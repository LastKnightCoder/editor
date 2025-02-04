import { useState } from 'react';

import TitlebarIcon from "@/components/TitlebarIcon";
import EditProjectInfoModal from "../../../components/EditProjectInfoModal";
import FocusMode from "../../../../components/FocusMode";

import useProjectsStore from "@/stores/useProjectsStore";
import { useMemoizedFn } from "ahooks";

import { CreateProject, CreateProjectItem, EProjectItemType } from "@/types";

import { MdExitToApp, MdFormatIndentDecrease, MdFormatIndentIncrease } from "react-icons/md";
import { EditOutlined, PlusOutlined, ReadOutlined } from "@ant-design/icons";
import { Descendant } from "slate";
import { message } from "antd";

import styles from './index.module.less';

const EMPTY_DESC: Descendant[] = [{
  type: 'paragraph',
  children: [{ type: 'formatted', text: '' }],
}];

const Project = () => {
  const [createProjectModalOpen, setCreateProjectModalOpen] = useState(false);

  const {
    activeProjectId,
    createRootProjectItem,
    activeProjectItemId,
    createProject,
    showOutline,
    readonly,
  } = useProjectsStore(state => ({
    activeProjectId: state.activeProjectId,
    activeProjectItemId: state.activeProjectItemId,
    createRootProjectItem: state.createRootProjectItem,
    createProject: state.createProject,
    showOutline: state.showOutline,
    readonly: state.readonly,
  }));

  const handleCreateProject = useMemoizedFn(async (title: string, desc: Descendant[]) => {
    if (!title) {
      message.error('请输入项目名称');
      return;
    }

    const project: CreateProject = {
      title,
      desc,
      children: [],
      archived: false
    }

    const createdProject = await createProject(project);
    if (createdProject) {
      useProjectsStore.setState({
        activeProjectId: createdProject.id,
      });
      setCreateProjectModalOpen(false);
    } else {
      message.error('创建项目失败');
    }
  });

  const handleCreate = useMemoizedFn(async () => {
    if (!activeProjectId) {
      // 打开新建项目对话框
      setCreateProjectModalOpen(true);
    } else {
      const defaultRootProjectItem: CreateProjectItem = {
        title: '默认名称',
        content: EMPTY_DESC,
        children: [],
        parents: [],
        projects: [activeProjectId],
        refType: '',
        refId: 0,
        projectItemType: EProjectItemType.Document
      }
      const createdProjectItem = await createRootProjectItem(activeProjectId, defaultRootProjectItem);
      if (createdProjectItem && !activeProjectItemId) {
        useProjectsStore.setState({
          activeProjectItemId: createdProjectItem.id,
        })
      }
    }
  });

  const handleQuit = useMemoizedFn(() => {
    useProjectsStore.setState({
      activeProjectItemId: null,
    });
  });

  const toggleReadOnly = useMemoizedFn(() => {
    useProjectsStore.setState({
      readonly: !readonly
    })
  });

  return (
    <div className={styles.iconList}>
      <TitlebarIcon onClick={handleCreate} tip={'创建项目'}>
        <PlusOutlined />
      </TitlebarIcon>
      <FocusMode />
      <TitlebarIcon onClick={toggleReadOnly} tip={readonly ? '切换编辑' : '切换只读'}>
        { readonly ? <EditOutlined /> : <ReadOutlined /> }
      </TitlebarIcon>
      <TitlebarIcon onClick={handleQuit} tip={'退出编辑'}>
        <MdExitToApp />
      </TitlebarIcon>
      <TitlebarIcon
        active={showOutline}
        onClick={() => {
          useProjectsStore.setState({ showOutline: !showOutline })
        }}
        tip={showOutline ? '收起目录' : '打开目录'}
      >
        { showOutline ? <MdFormatIndentIncrease /> : <MdFormatIndentDecrease /> }
      </TitlebarIcon>
      <EditProjectInfoModal
        open={createProjectModalOpen}
        title={''}
        desc={EMPTY_DESC}
        onOk={handleCreateProject}
        onCancel={() => setCreateProjectModalOpen(false)}
      />
    </div>
  )
}

export default Project;