import { Images } from "lucide-react";
import { IBlockPanelListItem } from "@tau/editor/api";
import { insertImageGallery } from "../../../utils/insertElement";

const items: IBlockPanelListItem[] = [
  {
    icon: Images,
    title: "图册",
    keywords: ["image-gallery", "图册", "tuce", "gallery"],
    description: "图册",
    onClick: editor => {
      insertImageGallery(editor);
    },
  },
];

export default items;
