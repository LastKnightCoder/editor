import { AudioLines } from "lucide-react";
import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertAudio } from "@/components/Editor/utils";

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
