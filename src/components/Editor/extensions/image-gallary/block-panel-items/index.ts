import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertImageGallery } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: "image-gallery",
    title: "图册",
    keywords: ["image-gallery", "图册", "tuce", "gallery"],
    description: "图册",
    onClick: (editor) => {
      insertImageGallery(editor);
    },
  },
];

export default items;
