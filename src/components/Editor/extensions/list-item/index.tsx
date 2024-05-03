import { Element } from 'slate';
import { RenderElementProps } from "slate-react";

import ListItem from './components/ListItem';
import { deleteBackward, insertBreak, withNormalize } from "./plugins";
import hotKeyConfigs from "./hotkeys";
import Base from '../base.ts';
import IExtension from "../types.ts";
import { ListItemElement } from "@/components/Editor/types";

class ListItemExtension extends Base implements IExtension {
  type = 'list-item';
  override getPlugins() {
    return [deleteBackward, insertBreak, withNormalize];
  }

  override getHotkeyConfigs() {
    return hotKeyConfigs;
  }

  override toMarkdown(element: Element, children: string, parentElement: Element): string {
    if (parentElement.type === 'bulleted-list') {
      // children 按照 \n 分割，第一行加上 -，其它行加上两个空格
      return children.split('\n').map((child, index) => {
        if (index === 0) {
          return `- ${child}`;
        } else {
          return `  ${child}`;
        }
      }).join('\n') + '\n';
    } else if (parentElement.type === 'numbered-list') {
      // 找到当前元素在父元素中的索引，第一行加上 1，然后加上 . 和一个空格，其它行加上两个空格
      const index = parentElement.children.findIndex(child => child === element);
      return children.split('\n').map((child, childIndex) => {
        if (childIndex === 0) {
          return `${index + 1}. ${child}`;
        } else {
          return `  ${child}`;
        }
      }).join('\n') + '\n';
    } else {
      return children + '\n';
    }
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return <ListItem attributes={attributes} element={element as ListItemElement}>{children}</ListItem>;
  }
}

export default ListItemExtension;