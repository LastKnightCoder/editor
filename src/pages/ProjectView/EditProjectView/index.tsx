import { useState, useEffect } from "react";
import { App } from "antd";
import EditProject from "../EditProjectItem";

import { getProjectItemById } from "@/commands";
import { EProjectItemType, ProjectItem } from "@/types";
import useProjectsStore from "@/stores/useProjectsStore";
import VideoNoteView from "../VideoNoteView";
import WhiteBoardProjectView from "../WhiteBoardProjectItemView";
import styles from "./index.module.less";
const EditProjectView = () => {
  const { activeProjectItemId } = useProjectsStore((state) => ({
    activeProjectItemId: state.activeProjectItemId,
  }));

  const { message } = App.useApp();

  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);

  useEffect(() => {
    if (activeProjectItemId) {
      getProjectItemById(activeProjectItemId)
        .then((item) => {
          setProjectItem(item);
        })
        .catch((e) => {
          console.error(e);
          message.error("获取项目内容失败");
        });
    }

    return () => {
      setProjectItem(null);
    };
  }, [activeProjectItemId, message]);

  if (!projectItem) return null;

  if (projectItem.projectItemType === EProjectItemType.VideoNote) {
    return (
      <div className={styles.container}>
        <VideoNoteView key={projectItem.id} videoNoteId={projectItem.refId} />
      </div>
    );
  }

  if (projectItem.projectItemType === EProjectItemType.WhiteBoard) {
    return (
      <div className={styles.container}>
        <WhiteBoardProjectView
          key={projectItem.id}
          projectItemId={projectItem.id}
        />
      </div>
    );
  }

  if (projectItem.projectItemType === EProjectItemType.Document) {
    return (
      <div className={styles.container}>
        <EditProject key={projectItem.id} projectItemId={projectItem.id} />
      </div>
    );
  }

  return null;
};

export default EditProjectView;
