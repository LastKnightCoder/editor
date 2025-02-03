import { useState, useEffect } from 'react';
import { App } from 'antd';
import EditProject from '@/layouts/ThreeColumnLayout/Content/Project';
import WhiteBoardProjectView from '../WhiteBoardProjectItemView';
import { getProjectItemById } from '@/commands';
import { EProjectItemType, ProjectItem } from '@/types';
import useProjectsStore from '@/stores/useProjectsStore';
const EditProjectView = () => {
  const {
    activeProjectItemId,
  } = useProjectsStore(state => ({
    activeProjectItemId: state.activeProjectItemId,
  }));

  const { message } = App.useApp();

  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);

  useEffect(() => {
    if (activeProjectItemId) {
      getProjectItemById(activeProjectItemId).then(item => {
        setProjectItem(item);
      }).catch(e => {
        console.error(e);
        message.error('获取项目内容失败');
      })
    }

    return () => {
      setProjectItem(null);
    }
  }, [activeProjectItemId, message]);

  if (!projectItem) return null;

  return (
    <div style={{
      width: '100%',
      height: '100%',
    }}>
      {
        projectItem.projectItemType === EProjectItemType.WhiteBoard ? (
          <WhiteBoardProjectView key={projectItem.id} />
        ) : (
          <EditProject key={projectItem.id} />
        )
      }
    </div>
  )
}

export default EditProjectView;