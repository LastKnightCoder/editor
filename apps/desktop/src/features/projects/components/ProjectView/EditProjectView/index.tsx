import { useState, useEffect } from "react";
import EditProject from "../EditProjectItem";

import { getProjectItemById } from "@/commands";
import { EProjectItemType, ProjectItem } from "@/types";
import { useProjectContext } from "../ProjectContext";
import VideoNoteView from "../VideoNoteView";
import AudioNoteView from "../AudioNoteView";
import WhiteBoardProjectView from "../WhiteBoardProjectItemView";
import WebViewProjectItemView from "../WebViewProjectItemView";
import TableProjectItemView from "../TableProjectItemView";
import PdfProjectItemView from "../PdfProjectItemView";
import EpubProjectItemView from "../EpubProjectItemView";
import { toast } from "@tau/ui";

const EditProjectView = () => {
  const { itemId: activeProjectItemId } = useProjectContext();

  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);

  useEffect(() => {
    if (activeProjectItemId) {
      getProjectItemById(activeProjectItemId)
        .then(item => {
          setProjectItem(item);
        })
        .catch(e => {
          console.error(e);
          toast.error("获取项目内容失败");
        });
    }

    return () => {
      setProjectItem(null);
    };
  }, [activeProjectItemId]);

  if (!projectItem) return null;

  if (projectItem.projectItemType === EProjectItemType.VideoNote) {
    return (
      <div className="h-full w-full">
        <VideoNoteView key={projectItem.id} videoNoteId={projectItem.refId} />
      </div>
    );
  }

  if (projectItem.projectItemType === EProjectItemType.AudioNote) {
    return (
      <div className="h-full w-full">
        <AudioNoteView
          key={projectItem.id}
          audioNoteId={projectItem.refId}
          title={projectItem.title}
        />
      </div>
    );
  }

  if (projectItem.projectItemType === EProjectItemType.Pdf) {
    return (
      <div className="h-full w-full">
        <PdfProjectItemView key={projectItem.id} projectItemId={projectItem.id} />
      </div>
    );
  }

  if (projectItem.projectItemType === EProjectItemType.Epub) {
    return (
      <div className="h-full w-full">
        <EpubProjectItemView key={projectItem.id} projectItemId={projectItem.id} />
      </div>
    );
  }

  if (projectItem.projectItemType === EProjectItemType.WhiteBoard) {
    return (
      <div className="h-full w-full">
        <WhiteBoardProjectView key={projectItem.id} projectItemId={projectItem.id} />
      </div>
    );
  }

  if (projectItem.projectItemType === EProjectItemType.TableView) {
    return (
      <div className="h-full w-full">
        <TableProjectItemView key={projectItem.id} projectItemId={projectItem.id} />
      </div>
    );
  }

  if (projectItem.projectItemType === EProjectItemType.WebView) {
    return (
      <div className="h-full w-full">
        <WebViewProjectItemView key={projectItem.id} projectItemId={projectItem.id} />
      </div>
    );
  }

  if (projectItem.projectItemType === EProjectItemType.Document) {
    return (
      <div className="h-full w-full">
        <EditProject key={projectItem.id} projectItemId={projectItem.id} />
      </div>
    );
  }

  return null;
};

export default EditProjectView;
