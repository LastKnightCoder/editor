import WhiteBoard from '@/components/WhiteBoard';
import { getProjectItemById, updateProjectItemWhiteBoardData } from '@/commands';
import { ProjectItem, WhiteBoard as IWhiteBoard } from '@/types';
import { useMemoizedFn, useRafInterval } from 'ahooks';
import { isEmpty } from 'lodash';
import { produce } from 'immer';
import { memo, useState, useEffect, useRef } from 'react';
import useProjectsStore from '@/stores/useProjectsStore';

const WhiteBoardProjectView = memo(() => {
  const {
    activeProjectItemId
  } = useProjectsStore(state => ({
    activeProjectItemId: state.activeProjectItemId,
  }));

  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
  const changed = useRef(false);

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
    setProjectItem(newProjectItem);
    changed.current = true;
  });
  
  const save = useMemoizedFn(async () => {
    if (changed.current && projectItem && projectItem.whiteBoardData) {
      const newProjectItem = await updateProjectItemWhiteBoardData(projectItem.id, projectItem.whiteBoardData);
      setProjectItem(newProjectItem);
      changed.current = false;
      // 不触发 refresh 事件好像也没问题，因为即使被覆盖了，也能保证 whiteBoard 数据能正常更新
    }
  });
  
  useRafInterval(() => {
    save();
  }, 3000);
  
  useEffect(() => {
    return () => {
      save();
    }
  }, [save]);

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
