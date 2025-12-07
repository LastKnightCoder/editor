import { Video } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertVideo } from "../../../utils";

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
