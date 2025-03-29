import VideoNote from "@/components/VideoNote";
import useUploadResource from "@/hooks/useUploadResource";
import { useCallback } from "react";
import { Descendant } from "slate";
import { VideoNote as VideoNoteType } from "@/types";
import useTheme from "@/hooks/useTheme";
const defaultContent = [
  {
    id: "1",
    startTime: 0,
    content: [
      {
        type: "paragraph",
        children: [
          {
            type: "formatted",
            text: "这是一个视频笔记",
          },
        ],
      },
    ] as Descendant[],
    count: 8,
  },
];

const VideoNoteDemo = () => {
  const uploadResource = useUploadResource();
  const { theme } = useTheme();

  const handleNotesChange = useCallback((value: VideoNoteType["notes"]) => {
    console.log(value);
  }, []);

  return (
    <VideoNote
      videoSrc="https://video-obsidian.oss-cn-beijing.aliyuncs.com/MutationObserver-base.mp4"
      initialNotes={defaultContent}
      onNotesChange={handleNotesChange}
      uploadResource={uploadResource}
      theme={theme}
    />
  );
};

export default VideoNoteDemo;
