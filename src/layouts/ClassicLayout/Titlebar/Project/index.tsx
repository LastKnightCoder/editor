import { useState } from 'react';

import TitlebarIcon from "@/components/TitlebarIcon";
import EditProjectInfoModal from "@/layouts/ClassicLayout/components/EditProjectInfoModal";

import useGlobalStateStore from "@/stores/useGlobalStateStore";
import useProjectsStore from "@/stores/useProjectsStore";
import { useMemoizedFn } from "ahooks";

import { CreateProject, CreateProjectItem } from "@/types";

import { MdCenterFocusWeak, MdExitToApp, MdFormatIndentIncrease, MdFormatIndentDecrease } from "react-icons/md";
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
    focusMode,
  } = useGlobalStateStore(state => ({
    focusMode: state.focusMode,
  }));

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
      children: []
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
        refId: 0
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
      <TitlebarIcon onClick={handleCreate}>
        <PlusOutlined />
      </TitlebarIcon>
      <TitlebarIcon active={focusMode} onClick={() => {
        useGlobalStateStore.setState({
          focusMode: !focusMode,
        });
      }}>
        <MdCenterFocusWeak />
      </TitlebarIcon>
      <TitlebarIcon onClick={toggleReadOnly}>
        { readonly ? <EditOutlined /> : <ReadOutlined /> }
      </TitlebarIcon>
      <TitlebarIcon onClick={handleQuit}>
        <MdExitToApp />
      </TitlebarIcon>
      <TitlebarIcon
        active={showOutline}
        onClick={() => {
          useProjectsStore.setState({ showOutline: !showOutline })
        }}
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