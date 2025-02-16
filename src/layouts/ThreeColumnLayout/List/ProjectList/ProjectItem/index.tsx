import { useState, useEffect, memo, useRef } from "react";
import { Descendant } from "slate";
import classnames from 'classnames';
import { useMemoizedFn } from "ahooks";
import { App, Dropdown, Input, MenuProps, message, Modal, Tooltip } from 'antd';
import { produce } from "immer";
import { nodeFetch } from '@/commands';

import SelectCardModal from "@/components/SelectCardModal";
import useProjectsStore from "@/stores/useProjectsStore";
import useWhiteBoardStore from "@/stores/useWhiteBoardStore";
import useDragAndDrop, { EDragPosition, IDragItem } from "@/hooks/useDragAndDrop";
import useChatLLM from "@/hooks/useChatLLM.ts";
import useAddRefCard from "./useAddRefCard";

import SVG from 'react-inlinesvg';
import For from "@/components/For";
import { getProjectById, getProjectItemById, updateProjectItem } from '@/commands';
import { CreateProjectItem, EProjectItemType, Message, type ProjectItem } from "@/types";
import { Role, CONVERT_PROMPT, WEB_CLIP_PROMPT, SPLIT_PROMPT } from '@/constants';
import { FileOutlined, FolderOpenTwoTone, MoreOutlined, PlusOutlined } from "@ant-design/icons";
import { getEditorText } from "@/utils";
import whiteBoardIcon from '@/assets/icons/white-board.svg';

import styles from './index.module.less';
import { isValid } from "@/components/WhiteBoard/utils";
import EditText, { EditTextHandle } from "@/components/EditText";

interface IProjectItemProps {
  projectItemId: number;
  parentProjectItemId: number;
  isRoot?: boolean;
  path: number[];
  parentChildren: number[];
}

const ProjectItem = memo((props: IProjectItemProps) => {
  const { projectItemId, isRoot = false, parentProjectItemId, path, parentChildren } = props;

  const { chatLLM } = useChatLLM();
  const [webClipModalOpen, setWebClipModalOpen] = useState(false);
  const [webClip, setWebClip] = useState('');
  const [titleEditable, setTitleEditable] = useState(false);
  const titleRef = useRef<EditTextHandle>(null);
  const parserControllerRef = useRef<AbortController>();
  const [parseLoading, setParseLoading] = useState(false);
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
    buildCardFromProjectItem,
  } = useAddRefCard(projectItem);
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

  const {
    createWhiteBoard
  } = useWhiteBoardStore(state => ({
    createWhiteBoard: state.createWhiteBoard,
  }))

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

  const moreMenuItems: MenuProps['items'] = projectItem?.projectItemType === EProjectItemType.Document
    ? [projectItem?.refType !== 'card' ? {
      key: 'to-card',
      label: '建立卡片',
    } : undefined, {
      key: 'remove',
      label: '删除文档',
    }].filter(isValid) : [projectItem?.refType !== 'white-board' ? {
      key: 'to-white-board',
      label: '建立白板',
    } : undefined, {
      key: 'remove',
      label: '删除白板'
    }, {
      key: 'edit-title',
      label: '编辑标题',
    }].filter(isValid)

  const handleMoreMenuClick: MenuProps['onClick'] = useMemoizedFn(async ({ key }) => {
    if (key === 'to-card') {
      if (!projectItem) return;
      await buildCardFromProjectItem(projectItem);
      message.success('成功建立卡片');
    } else if (key === 'to-white-board') {
      if (!projectItem) return;
      if (projectItem.projectItemType !== EProjectItemType.WhiteBoard || !projectItem.whiteBoardData) return;
      // 已经关联了白板，不能关联新的白板
      if (projectItem.refType === 'white-board') return;
      const createWhiteBoardData = {
        title: projectItem.title,
        description: projectItem.title,
        tags: [],
        data: projectItem.whiteBoardData,
        snapshot: '',
        isProjectItem: true
      }
      try {
        const createdWhiteBoard = await createWhiteBoard(createWhiteBoardData);
        // 更新 ProjectItem 的 refType
        const newProjectItem = produce(projectItem, draft => {
          draft.refId = createdWhiteBoard.id;
          draft.refType = 'white-board';
        });
        await updateProjectItem(newProjectItem);
        const event = new CustomEvent('refreshProjectItem', {
          detail: {
            id: projectItem.id
          },
        })
        document.dispatchEvent(event);
        message.success('成功创建白板');
      } catch (e) {
        console.error(e);
        message.error('创建白板失败');
      }
    } else if (key === 'remove') {
      await onRemoveProjectItem();
    } else if (key === 'edit-title') {
      setTitleEditable(true);
      titleRef.current?.setContentEditable(true);
      titleRef.current?.focusEnd();
    }
  });

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
  }, {
    key: 'add-web-project-item',
    label: '解析网页',
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
        projectItemType: EProjectItemType.Document,
        count: 0,
      }
      await createChildProjectItem(projectItemId, createProjectItem);

      const event = new CustomEvent('refreshProjectItem', {
        detail: {
          id: projectItemId
        },
      });
      document.dispatchEvent(event);
    } else if (key === 'add-white-board-project-item') {
      if (!projectItemId) return;
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
        parents: [projectItemId],
        projects: [],
        refType: '',
        refId: 0,
        projectItemType: EProjectItemType.WhiteBoard,
        count: 0,
      }
      await createChildProjectItem(projectItemId, createProjectItem);

      const event = new CustomEvent('refreshProjectItem', {
        detail: {
          id: projectItemId
        },
      });
      document.dispatchEvent(event);
    } else if (key === 'link-card-project-item') {
      openSelectCardModal();
    } else if (key === 'link-white-board-project-item') {
      // TODO 打开白板选择弹窗
    } else if (key === 'add-web-project-item') {
      setWebClipModalOpen(true);
    }
  });

  useEffect(() => {
    if (!projectItem) return;

    const handleProjectTitleChange = (e: any) => {
      const changedItem = e.detail;
      if (changedItem.id === projectItem.id) {
        setProjectItem(changedItem);
        titleRef.current?.setValue(changedItem.title);
      }
    }

    document.addEventListener('projectTitleChange', handleProjectTitleChange);

    return () => {
      document.removeEventListener('projectTitleChange', handleProjectTitleChange);
    }
  }, [projectItem]);

  useEffect(() => {
    const handleRefreshProjectItem = (e: any) => {
      const { id } = (e as CustomEvent<{ id: number }>).detail;
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
        onClick={async () => {
          const activeProjectItem = await getProjectItemById(projectItem.id);
          if (!activeProjectItem) return;
          const headers = activeProjectItem.content.filter(node => node.type === 'header');
          useProjectsStore.setState({
            activeProjectItemId: projectItem.id,
            showOutline: headers.length > 0,
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
                projectItem.children.length > 0 
                  ? <FolderOpenTwoTone /> 
                  : projectItem.projectItemType === EProjectItemType.WhiteBoard 
                    ? <SVG src={whiteBoardIcon} /> 
                    : <FileOutlined />
              }
            </div>
          </Tooltip>
          <EditText
            className={styles.title}
            key={projectItem.id}
            ref={titleRef}
            defaultValue={projectItem.title}
            contentEditable={titleEditable}
            onPressEnter={() => {
              const textContent = titleRef.current?.getValue() || projectItem?.title;
              setTitleEditable(false);
              if (textContent !== projectItem.title) {
                // 更新标题
                updateProjectItem({
                  ...projectItem,
                  title: textContent,
                }).then((newProjectItem) => {
                  setProjectItem(newProjectItem);
                  setTitleEditable(false);
                  titleRef.current?.setContentEditable(false);
                })
              }
            }}
          />
          {/*<div className={styles.title}>{projectItem.title}</div>*/}
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
      <Modal
        open={webClipModalOpen}
        title={'添加网页'}
        confirmLoading={parseLoading}
        maskClosable={!parseLoading}
        onOk={async () => {
          if (!projectItem || !activateProjectId) {
            return;
          }
          setParseLoading(true);
          if (parserControllerRef.current) {
            parserControllerRef.current.abort();
          }
          parserControllerRef.current = new AbortController();
          parserControllerRef.current.signal.addEventListener('abort', () => {
            setParseLoading(false);
          })

          if (parserControllerRef.current.signal.aborted) {
            return;
          }
          message.loading({
            key: 'fetch-html',
            content: '正在请求 HTML 文件，请稍等...',
            duration: 0
          });

          const res = await nodeFetch(webClip, {
            method: "GET"
          });
          message.destroy('fetch-html');

          const text = res.data as string;
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'text/html');
          // 移除所有的 scripts
          doc.querySelectorAll('script').forEach(script => script.remove());
          const pageContent = doc.getElementById('page-content');
          if (!pageContent) {
            message.error('无法获取网页内容');
            return;
          }

          if (parserControllerRef.current.signal.aborted) {
            return;
          }
          message.loading({
            key: 'html-convert',
            content: '正在处理 HTML 文件，请稍后',
            duration: 0
          });
          const convertMessages: Message[] = [{
            role: Role.System,
            content: CONVERT_PROMPT,
          }, {
            role: Role.User,
            content: pageContent.innerHTML
          }];
          const convertRes = await chatLLM(convertMessages) || '';
          message.destroy('html-convert');

          if (parserControllerRef.current.signal.aborted) {
            return;
          }
          message.loading({
            key: 'html-split',
            content: '正在分割文本，请稍后',
            duration: 0
          })
          const splitMessages: Message[] = [{
            role: Role.System,
            content: SPLIT_PROMPT,
          }, {
            role: Role.User,
            content: convertRes
          }];
          const splitRes = await chatLLM(splitMessages) || '[]';
          message.destroy('html-split');

          try {
            const splitArray: string[] = JSON.parse(splitRes);
            if (parserControllerRef.current.signal.aborted) {
              return;
            }
            message.loading({
              key: 'html-process',
              content: '正在处理文本，请稍后',
              duration: 0
            })
            const [res1, res2] = await Promise.all(splitArray.map(async item => {
              const messages: Message[] = [{
                role: Role.System,
                content: WEB_CLIP_PROMPT
              }, {
                role: Role.User,
                content: item
              }];
              let aiRes = await chatLLM(messages);
              if (aiRes) {
                aiRes = aiRes.trim();
                if (aiRes.startsWith("```json") && aiRes.endsWith("```")) {
                  aiRes = aiRes.slice(7, -3);
                }
              }
              return aiRes;
            }));

            const res1Json = JSON.parse(res1 || '[]');
            const res2Json = JSON.parse(res2 || '[]');

            let jsonContent: Descendant[] = [...res1Json, ...res2Json];

            let title = '新文档';
            if (jsonContent.length > 0) {
              if (jsonContent[0].type === 'header') {
                title = getEditorText(jsonContent[0].children);
                jsonContent = jsonContent.slice(1);
              }
            }

            if (parserControllerRef.current.signal.aborted) {
              return;
            }
            const createProjectItem: CreateProjectItem = {
              title,
              content: jsonContent,
              children: [],
              parents: [projectItem.id],
              projects: [activateProjectId],
              refType: '',
              refId: 0,
              projectItemType: EProjectItemType.Document,
              count: 0,
            }

            await createChildProjectItem(projectItem.id, createProjectItem);

            const event = new CustomEvent('refreshProjectItem', {
              detail: {
                id: projectItem.id
              },
            });
            document.dispatchEvent(event);
            setWebClip('');
            setWebClipModalOpen(false);
          } catch (e) {
            console.error(e);
          } finally {
            parserControllerRef.current = undefined;
            message.destroy('html-process');
          }
        }}
        onCancel={() => {
          setWebClip('');
          setWebClipModalOpen(false);
          parserControllerRef.current?.abort();
          parserControllerRef.current = undefined;
          message.destroy();
        }}
      >
        <Input
          value={webClip}
          onChange={(e) => setWebClip(e.target.value)}
          placeholder='请输入网址'
        />
      </Modal>
    </div>
  )
});

export default ProjectItem;
