import CheckList from '@/components/Editor/components/CheckList';
import CheckListItem from '@/components/Editor/components/CheckListItem';

import { CheckListElement, CheckListItemElement } from "@/components/Editor/types";

import Base from '../base';
import IExtension from "../types.ts";
import { insertBreak, deleteBackward } from './plugins';

import {RenderElementProps} from "slate-react";

export class CheckListExtension extends Base implements IExtension {
  type = 'check-list';

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