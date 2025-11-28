import { Video } from "lucide-react";
import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertVideo } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: Video,
    title: "视频",
    keywords: ["video", "视频", "shipin"],
    description: "视频",
    onClick: (editor) => {
      insertVideo(editor, {
        src: "",
        uploading: false,
      });
    },
  },
];

export default items;
