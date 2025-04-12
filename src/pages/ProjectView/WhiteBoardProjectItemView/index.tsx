import WhiteBoard from "@/components/WhiteBoard";
import {
  getProjectItemById,
  getWhiteBoardContentById,
  updateWhiteBoardContent,
} from "@/commands";
import { ProjectItem, WhiteBoardContent } from "@/types";
import { useThrottleFn } from "ahooks";
import { memo, useState, useEffect } from "react";

const WhiteBoardProjectView = memo((props: { projectItemId: number }) => {
  const { projectItemId } = props;

  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
  const [whiteBoardContent, setWhiteBoardContent] =
    useState<WhiteBoardContent | null>(null);

  useEffect(() => {
    if (projectItemId) {
      getProjectItemById(projectItemId)
        .then((item) => {
          setProjectItem(item);
          getWhiteBoardContentById(item.whiteBoardContentId)
            .then((content) => {
              setWhiteBoardContent(content);
            })
            .catch((e) => {
              console.error(e);
            });
        })
        .catch((e) => {
          console.error(e);
        });
    }

    return () => {
      setProjectItem(null);
    };
  }, [projectItemId]);

  const { run: onWhiteBoardChange } = useThrottleFn(
    async (data: WhiteBoardContent["data"]) => {
      if (!projectItem || !whiteBoardContent) return;
      updateWhiteBoardContent({
        id: whiteBoardContent.id,
        name: whiteBoardContent.name,
        data,
      });
    },
    {
      wait: 1000,
    },
  );

  if (!projectItem || !whiteBoardContent) return null;

  const { data } = whiteBoardContent;

  return (
    <WhiteBoard
      initData={data.children}
      initSelection={data.selection}
      initViewPort={data.viewPort}
      initPresentationSequences={data.presentationSequences}
      onChange={onWhiteBoardChange}
    />
  );
});

export default WhiteBoardProjectView;
