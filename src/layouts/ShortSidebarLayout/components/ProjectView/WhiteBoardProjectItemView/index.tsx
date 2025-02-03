import WhiteBoard from '@/components/WhiteBoard';
import { updateProjectItem, getProjectItemById } from '@/commands';
import { ProjectItem, WhiteBoard as IWhiteBoard } from '@/types';
import { useMemoizedFn } from 'ahooks';
import { isEmpty } from 'lodash';
import { produce } from 'immer';
import { memo, useState, useEffect } from 'react';
import useProjectsStore from '@/stores/useProjectsStore';

const WhiteBoardProjectView = memo(() => {
  const {
    activeProjectItemId
  } = useProjectsStore(state => ({
    activeProjectItemId: state.activeProjectItemId,
  }));

  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);

  useEffect(() => {
    if (activeProjectItemId) {
      getProjectItemById(activeProjectItemId).then(item => {
        setProjectItem(item);
      }).catch(e => {
        console.error(e);
      });
    }

    return () => {
      setProjectItem(null);
    }
  }, [activeProjectItemId]);

  const onWhiteBoardChange = useMemoizedFn(async (data: IWhiteBoard['data']) => {
    if (!projectItem) return;
    const newProjectItem = produce(projectItem, draft => {
      draft.whiteBoardData = data;
    });
    await updateProjectItem(newProjectItem);
    const event = new CustomEvent('refreshProjectItem', {
      detail: {
        id: projectItem.id
      },
    })
    document.dispatchEvent(event);
  });

  if (!projectItem || !projectItem.whiteBoardData || isEmpty(projectItem.whiteBoardData)) return null

  const { whiteBoardData } = projectItem;

  return (
    <WhiteBoard
      initData={whiteBoardData.children}
      initSelection={whiteBoardData.selection}
      initViewPort={whiteBoardData.viewPort}
      onChange={onWhiteBoardChange}
    />
  )
});

export default WhiteBoardProjectView;
