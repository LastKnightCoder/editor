import { useMemo } from "react";
import { Dropdown, Empty, MenuProps } from "antd";
import { HomeOutlined, MenuFoldOutlined, PlusOutlined } from '@ant-design/icons';
import useProjectsStore from "@/stores/useProjectsStore";
import { useNavigate } from "react-router-dom";

import ProjectItem from '../ProjectItem';
import If from "@/components/If";
import For from "@/components/For";

import styles from './index.module.less';
import { CreateProjectItem, EProjectItemType } from "@/types";
import { useMemoizedFn } from "ahooks";
import SelectCardModal from "@/components/SelectCardModal";
import useAddRefCard from "../ProjectItem/useAddRefCard.ts";

const Project = () => {
  const {
    projects,
    activeProjectId,
    createRootProjectItem,
    activeProjectItemId,
  } = useProjectsStore(state => ({
    projects: state.projects,
    activeProjectId: state.activeProjectId,
    createRootProjectItem: state.createRootProjectItem,
    activeProjectItemId: state.activeProjectItemId,
  }));

  const project = useMemo(() => {
    return projects.find(p => p.id === activeProjectId);
  }, [projects, activeProjectId]);
  
  const navigate = useNavigate();
  
  const {
    selectedCards,
    onChange,
    onOk,
    onCancel,
    selectCardModalOpen,
    openSelectCardModal,
    cards,
    excludeCardIds,
  } = useAddRefCard();
  
  const addMenuItems: MenuProps['items'] = [{
    key: 'add-project-item',
    label: '添加文档',
  }, {
    key: 'add-white-board-project-item',
    label: '添加白板',
  }, {
    key: 'link-card-project-item',
    label: '关联卡片',
  }, {
    key: 'link-white-board-project-item',
    label: '关联白板',
  }];
  
  const handleAddMenuClick: MenuProps['onClick'] = useMemoizedFn(async ({ key }) => {
    if (!project) return;
    if (key === 'add-project-item') {
      const createProjectItem: CreateProjectItem = {
        title: '新文档',
        content: [{
          type: 'paragraph',
          children: [{ type: 'formatted', text: '' }]
        }],
        children: [],
        parents: [],
        projects: [project.id],
        refType: '',
        refId: 0,
        projectItemType: EProjectItemType.Document,
        count: 0,
      }
      const item = await createRootProjectItem(project.id, createProjectItem);
      if (item) {
        useProjectsStore.setState({
          activeProjectItemId: item.id,
        })
      }
    } else if (key === 'add-white-board-project-item') {
      const createProjectItem: CreateProjectItem = {
        title: '新白板',
        content: [],
        whiteBoardData: {
          children: [],
          viewPort: {
            zoom: 1,
            minX: 0,
            minY: 0,
            width: 0,
            height: 0
          },
          selection: {
            selectArea: null,
            selectedElements: [],
          },
        },
        children: [],
        parents: [],
        projects: [project.id],
        refType: '',
        refId: 0,
        projectItemType: EProjectItemType.WhiteBoard,
        count: 0,
      }
      const item = await createRootProjectItem(project.id, createProjectItem);
      if (item) {
        useProjectsStore.setState({
          activeProjectItemId: item.id,
        })
      }
    } else if (key === 'link-card-project-item') {
      openSelectCardModal();
    } else if (key === 'link-white-board-project-item') {
      // TODO 打开白板选择弹窗
    }
  });
  
  
  const onFoldSidebar = () => {
    useProjectsStore.setState({
      hideProjectItemList: true
    });
  };

  if (!project) return null;

  return (
    <div className={styles.list}>
      <div className={styles.header}>
        <div className={styles.title}>
          <HomeOutlined
            onClick={() => {
              useProjectsStore.setState({
                activeProjectId: null,
                activeProjectItemId: null,
                hideProjectItemList: false
              });
              navigate(`/projects/list`)
            }}
          />
          {project.title}
        </div>
        <div className={styles.icons}>
          {
            activeProjectItemId && (
              <div className={styles.icon} onClick={onFoldSidebar}>
                <MenuFoldOutlined />
              </div>
            )
          }
          <Dropdown
            menu={{
              items: addMenuItems,
              onClick: handleAddMenuClick
            }}
          >
            <div className={styles.icon}>
              <PlusOutlined />
            </div>
          </Dropdown>
        </div>
      </div>
      <div className={styles.divider}></div>
      <If condition={project.children.length === 0}>
        <Empty description={'项目下暂无文档'} />
      </If>
      <For
        data={project.children}
        renderItem={(projectItemId, index) => (
          <ProjectItem
            projectItemId={projectItemId}
            isRoot
            key={projectItemId}
            path={[index]}
            parentProjectItemId={project.id}
            parentChildren={project.children}
          />
        )}
      />
      <SelectCardModal
        title={'选择关联卡片'}
        selectedCards={selectedCards}
        onChange={onChange}
        open={selectCardModalOpen}
        allCards={cards}
        onCancel={onCancel}
        onOk={onOk}
        excludeCardIds={excludeCardIds}
      />
    </div>
  )
}

export default Project;
