import {RenderElementProps} from "slate-react";

import { CheckListElement, CheckListItemElement } from "@/components/Editor/types";


import CheckList from './components/CheckList';
import CheckListItem from './components/CheckListItem';
import { insertBreak, deleteBackward } from './plugins';
import blockPanelItems from "./block-panel-items";

import Base from '../base';
import IExtension from "../types.ts";

export class CheckListExtension extends Base implements IExtension {
  type = 'check-list';

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <CheckList element={element as CheckListElement} attributes={attributes}>
        {children}
      </CheckList>
    )
  }
}

export class CheckListItemExtension extends Base implements IExtension {
  type = 'check-list-item';

  override getPlugins() {
    return [insertBreak, deleteBackward]
  }

  render(props: RenderElementProps) {
    const { attributes, children, element } = props;
    return (
      <CheckListItem element={element as CheckListItemElement} attributes={attributes}>
        {children}
      </CheckListItem>
    )
  }
}