import Whiteboard from "@/features/shared/whiteboard/DesktopWhiteboard";
import { getProjectItemById, getWhiteboardContentById, updateWhiteboardContent } from "@/commands";
import { getDocumentVersion } from "@tau/whiteboard";
import { ProjectItem, WhiteboardContent } from "@/types";
import { useThrottleFn } from "ahooks";
import { memo, useState, useEffect } from "react";

const WhiteboardProjectView = memo((props: { projectItemId: number }) => {
  const { projectItemId } = props;

  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
  const [whiteBoardContent, setWhiteboardContent] = useState<WhiteboardContent | null>(null);

  useEffect(() => {
    if (projectItemId) {
      getProjectItemById(projectItemId)
        .then(item => {
          if (!item) return;
          setProjectItem(item);
          getWhiteboardContentById(item.whiteBoardContentId)
            .then(content => {
              setWhiteboardContent(content);
            })
            .catch(e => {
              console.error(e);
            });
        })
        .catch(e => {
          console.error(e);
        });
    }

    return () => {
      setProjectItem(null);
    };
  }, [projectItemId]);

  const { run: onWhiteboardChange } = useThrottleFn(
    async (data: WhiteboardContent["data"]) => {
      if (!projectItem || !whiteBoardContent) return;
      updateWhiteboardContent({
        id: whiteBoardContent.id,
        name: whiteBoardContent.name,
        imgUrl: whiteBoardContent.imgUrl,
        data,
      });
    },
    {
      wait: 1000,
    }
  );

  if (!projectItem || !whiteBoardContent) return null;

  const { data } = whiteBoardContent;

  return (
    <Whiteboard
      showSidebar={false}
      initData={data.children}
      initSelection={data.selection}
      initViewPort={data.viewPort}
      initPresentationSequences={data.presentationSequences}
      initSketch={data.sketch}
      version={getDocumentVersion(data)}
      onChange={onWhiteboardChange}
    />
  );
});

export default WhiteboardProjectView;
