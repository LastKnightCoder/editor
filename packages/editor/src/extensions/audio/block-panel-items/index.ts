import { AudioLines } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertAudio } from "../../../utils";

const items: IBlockPanelListItem[] = [
  {
    icon: AudioLines,
    title: "音频",
    keywords: ["audio", "音频", "yinpin"],
    description: "音频",
    onClick: (editor) => {
      insertAudio(editor, {
        src: "",
        uploading: false,
      });
    },
  },
];

export default items;
