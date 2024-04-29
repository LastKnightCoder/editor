import { useState, useEffect, memo } from "react";
import classnames from 'classnames';
import { useMemoizedFn } from "ahooks";
import { App, Dropdown, MenuProps, Tooltip } from 'antd';
import { produce } from "immer";

import useProjectsStore from "@/stores/useProjectsStore";
import useDragAndDrop, { EDragPosition, IDragItem } from "@/hooks/useDragAndDrop";
import useAddRefCar from "./useAddRefCard";

import { getProjectById, getProjectItemById, updateProjectItem } from '@/commands';
import { CreateProjectItem, ProjectItem } from "@/types";
import { FileOutlined, FolderOpenTwoTone, MoreOutlined, PlusOutlined } from "@ant-design/icons";
import For from "@/components/For";

import styles from './index.module.less';
import SelectCardModal from "@/components/SelectCardModal";

interface IProjectItemProps {
  projectItemId: number;
  parentProjectItemId: number;
  isRoot?: boolean;
  path: number[];
  parentChildren: number[];
}

const ProjectItem = memo((props: IProjectItemProps) => {
  const { projectItemId, isRoot = false, parentProjectItemId, path, parentChildren } = props;

  const [projectItem, setProjectItem] = useState<ProjectItem>();
  const [folderOpen, setFolderOpen] = useState(() => {
    return path.length === 1;
  });
  const {
    cards,
    selectCardModalOpen,
    openSelectCardModal,
    selectedCards,
    excludeCardIds,
    onOk,
    onCancel,
    onChange,
  } = useAddRefCar(projectItem);
  const { modal } = App.useApp();

  const refresh = useMemoizedFn((projectItemId) => {
    getProjectItemById(projectItemId)
      .then((projectItem) => {
        setProjectItem(projectItem);
      });
  });

  useEffect(() => {
    refresh(projectItemId)
  }, [refresh, projectItemId]);

  const {
    updateProject,
    activateProjectId,
    activeProjectItemId,
    removeChildProjectItem,
    removeRootProjectItem,
    createChildProjectItem,
  } = useProjectsStore(state => ({
    updateProject: state.updateProject,
    activateProjectId: state.activeProjectId,
    activeProjectItemId: state.activeProjectItemId,
    removeRootProjectItem: state.removeRootProjectItem,
    removeChildProjectItem: state.removeChildProjectItem,
    createChildProjectItem: state.createChildProjectItem,
  }));

  const onRemoveProjectItem = useMemoizedFn(async () => {
    modal.confirm({
      title: '删除项目文档',
      content: '确定删除该项目文档吗？',
      onOk: async () => {
        if (isRoot) {
          if (activateProjectId) {
            await removeRootProjectItem(activateProjectId, projectItemId);
          }
        } else {
          if (parentProjectItemId) {
            await removeChildProjectItem(parentProjectItemId, projectItemId);
            const event = new CustomEvent('refreshProjectItem', {
              detail: {
                id: parentProjectItemId
              }
            });
            document.dispatchEvent(event);
          }
        }
        if (activeProjectItemId === projectItemId) {
          useProjectsStore.setState({
            activeProjectItemId: null,
          });
        }
      },
      okText: '确定',
      cancelText: '取消',
      okButtonProps: {
        danger: true,
      }
    })
  });

  const onDrop = useMemoizedFn(async (dragItem: IDragItem, dragPosition: EDragPosition) => {
    if (!projectItem || !activateProjectId) return;
    // 先删掉原来的位置，在新的位置插入
    const { itemId: dragId, parentId: dragParentId, isRoot: dragIsRoot } = dragItem;
    
    const needRefreshId = [dragId];
    
    try {
      useProjectsStore.setState({
        dragging: true,
      })
      if (dragIsRoot) {
        if (activateProjectId) {
          await removeRootProjectItem(activateProjectId, dragId);
        }
      } else {
        if (dragParentId) {
          await removeChildProjectItem(dragParentId, dragId);
          needRefreshId.push(dragParentId);
        }
      }

      const dragProjectItem = await getProjectItemById(dragId);
      if (!dragProjectItem) return;

      if (dragPosition === EDragPosition.Inside) {
        const newDragProjectItem = produce(dragProjectItem, draft => {
          if (!draft.parents.includes(projectItemId)) {
            draft.parents.push(projectItemId);
          }
          for (const projectId of projectItem.projects) {
            if (!draft.projects.includes(projectId)) {
              draft.projects.push(projectId);
            }
          }
        });
        await updateProjectItem(newDragProjectItem);
        const newProjectItem = produce(projectItem, draft => {
          if (!draft.children.includes(dragId)) {
            draft.children.push(dragId);
          }
        });
        await updateProjectItem(newProjectItem);
        needRefreshId.push(projectItemId);
      } else {
        const project = await getProjectById(activateProjectId);
        if (!project) return;
        if (isRoot) {
          // 如果是 root，则更新 project，向 project 中添加新的 projectItem
          const newProject = produce(project, draft => {
            draft.children = draft.children.filter(childId => childId !== dragId);
            // 获取当前 projectItem 在 project 中的位置
            const index = draft.children.findIndex(childId => childId === projectItemId);
            if (index === -1) return;
            const spliceIndex = dragPosition === EDragPosition.Top ? index : index + 1;
            draft.children.splice(spliceIndex, 0, dragId);
          });
          // 更新 project
          await updateProject(newProject);
          // 更新其 projects
          const newDragProjectItem = produce(dragProjectItem, draft => {
            if (!draft.projects.includes(activateProjectId)) {
              draft.projects.push(activateProjectId);
            }
          });
          await updateProjectItem(newDragProjectItem);
        } else {
          const parentProjectItem = await getProjectItemById(parentProjectItemId);
          if (!parentProjectItem) return;
          const newDragProjectItem = produce(dragProjectItem, draft => {
            if (!draft.parents.includes(parentProjectItemId)) {
              draft.parents.push(parentProjectItemId);
            }
            for (const projectId of parentProjectItem.projects) {
              if (!draft.projects.includes(projectId)) {
                draft.projects.push(projectId);
              }
            }
          });
          await updateProjectItem(newDragProjectItem);
          const newParentProjectItem = produce(parentProjectItem, draft => {
            // 找到当前 projectItem 在父节点中的位置
            const index = draft.children.findIndex(childId => childId === projectItemId);
            if (index === -1) return;
            const spliceIndex = dragPosition === EDragPosition.Top ? index : index + 1;
            draft.children.splice(spliceIndex, 0, dragId);
          });
          await updateProjectItem(newParentProjectItem);
          needRefreshId.push(parentProjectItemId);
        }
      }
    } finally {
      if (activeProjectItemId && [dragId, dragParentId, projectItemId, parentProjectItemId].includes(activeProjectItemId)) {
        needRefreshId.push(activeProjectItemId);
      }
      for (const refreshId of [...new Set(needRefreshId)]) {
        const event = new CustomEvent('refreshProjectItem', {
          detail: { id: refreshId }
        });
        document.dispatchEvent(event);
      }
      useProjectsStore.setState({
        dragging: false
      });
    }
  });

  const {
    drag,
    drop,
    isDragging,
    dropContainerRef,
    dragPosition,
    isOver,
    canDrop,
  } = useDragAndDrop({
    itemId: projectItemId,
    parentId: parentProjectItemId,
    isRoot,
    path,
    onDrop,
    children: projectItem?.children || [],
    parentChildren,
  });

  const moreMenuItems: MenuProps['items'] = [{
    key: 'remove',
    label: '删除文档',
  }];

  const handleMoreMenuClick: MenuProps['onClick'] = useMemoizedFn(async ({ key }) => {
    if (key === 'remove') {
      await onRemoveProjectItem();
    }
  });

  const addMenuItems: MenuProps['items'] = [{
    key: 'add-project-item',
    label: '添加文档',
  }, {
    key: 'add-card-project-item',
    label: '关联卡片',
  }]

  const handleAddMenuClick: MenuProps['onClick'] = useMemoizedFn(async ({ key }) => {
    if (key === 'add-project-item') {
      if (!projectItemId) return;
      const createProjectItem: CreateProjectItem = {
        title: '新文档',
        content: [{
          type: 'paragraph',
          children: [{ type: 'formatted', text: '' }]
        }],
        children: [],
        parents: [projectItemId],
        projects: [],
        refType: '',
        refId: 0,
      }
      await createChildProjectItem(projectItemId, createProjectItem);

      const event = new CustomEvent('refreshProjectItem', {
        detail: {
          id: projectItemId
        },
      });
      document.dispatchEvent(event);
    } else if (key === 'add-card-project-item') {
      openSelectCardModal();
    }
  });

  useEffect(() => {
    if (!projectItem) return;

    const handleProjectTitleChange = (e: any) => {
      const changedItem = e.detail;
      if (changedItem.id === projectItem.id) {
        setProjectItem(changedItem);
      }
    }

    document.addEventListener('projectTitleChange', handleProjectTitleChange);

    return () => {
      document.removeEventListener('projectTitleChange', handleProjectTitleChange);
    }
  }, [projectItem]);
  
  useEffect(() => {
    const handleRefreshProjectItem = (e: any) => {
      const { id } = e.detail;
      if (id === projectItemId) {
        refresh(projectItemId);
      }
    }

    document.addEventListener('refreshProjectItem', handleRefreshProjectItem);

    return () => {
      document.removeEventListener('refreshProjectItem', handleRefreshProjectItem);
    }

  }, [projectItemId, refresh])

  if (!projectItem) return null;

  return (
    <div ref={drag} className={classnames(styles.item, {
      [styles.dragging]: isDragging,
    })}>
      <div
        ref={node => {
          dropContainerRef.current = node;
          drop(node);
        }}
        className={classnames(styles.header, {
          [styles.active]: activeProjectItemId === projectItem.id,
          [styles.top]: isOver && canDrop && dragPosition === EDragPosition.Top,
          [styles.bottom]: isOver && canDrop && dragPosition === EDragPosition.Bottom,
          [styles.inside]: isOver && canDrop && dragPosition === EDragPosition.Inside,
        })}
        onClick={() => {
          useProjectsStore.setState({
            activeProjectItemId: projectItem.id,
          });
        }}
      >
        <div className={styles.titleContainer}>
          <Tooltip
            title={projectItem.children.length > 0 ? folderOpen ? '收起' : '展开' : undefined}
          >
            <div
              className={classnames(styles.icon, { [styles.hoverable]: projectItem.children.length > 0 })}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (projectItem.children.length === 0) return;
                setFolderOpen(!folderOpen);
              }}
            >
              {
                projectItem.children.length > 0 ? <FolderOpenTwoTone /> : <FileOutlined />
              }
            </div>
          </Tooltip>
          <div className={styles.title}>{projectItem.title}</div>
        </div>
        <div
          onClick={e => {
            e.stopPropagation();
          }}
          className={styles.icons}
        >
          <Dropdown
            menu={{
              items: moreMenuItems,
              onClick: handleMoreMenuClick
            }}
          >
            <div className={styles.icon}>
              <MoreOutlined />
            </div>
          </Dropdown>
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
      <div className={classnames(styles.gridContainer, {
        [styles.hide]: !folderOpen || projectItem.children.length === 0,
      })}>
        <div className={styles.children}>
          <For
            data={projectItem.children}
            renderItem={(projectItemId, index) => (
             <ProjectItem
               key={projectItemId}
               projectItemId={projectItemId}
               parentProjectItemId={projectItem.id}
               isRoot={false}
               path={[...path, index]}
               parentChildren={projectItem.children}
             />
            )}
          />
        </div>
      </div>
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
});

export default ProjectItem;
