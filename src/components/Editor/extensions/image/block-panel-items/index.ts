import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertImage } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [{
  icon: 'image',
  title: 'image',
  keywords: ['image', '图片'],
  description: 'image',
  onClick: (editor) => {
    insertImage(editor, {
      url: ''
    });
  }
}]

export default items;
