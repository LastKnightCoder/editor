import VideoNote from "@/components/VideoNote";
import useUploadResource from "@/hooks/useUploadResource";
import { useCallback } from "react";
import { Descendant } from "slate";
const defaultContent = [
  {
    type: "paragraph",
    children: [
      {
        type: "formatted",
        text: "这是一个视频笔记",
      },
    ],
  },
] as Descendant[];

const VideoNoteDemo = () => {
  const uploadResource = useUploadResource();

  const handleNotesChange = useCallback((value: Descendant[]) => {
    console.log(value);
  }, []);

  return (
    <VideoNote
      videoSrc="https://video-obsidian.oss-cn-beijing.aliyuncs.com/MutationObserver-base.mp4"
      initialNotes={defaultContent}
      onNotesChange={handleNotesChange}
      uploadResource={uploadResource}
    />
  );
};

export default VideoNoteDemo;
