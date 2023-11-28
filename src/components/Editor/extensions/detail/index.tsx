import { RenderElementProps } from "slate-react";
import { DetailElement } from "@/components/Editor/types";

import Detail from './components/Detail';
import { deleteBackward, quit, withNormalize } from './plugins';
import blockPanelItems from './block-panel-items';

import Base from '../base.ts';
import IExtension from "../types.ts";

class DetailExtension extends Base implements IExtension {
  type = 'detail';
  override getPlugins() {
    return [deleteBackward, quit, withNormalize];
  }

  override getBlockPanelItems() {
    return blockPanelItems;
  }

  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <Detail element={element as DetailElement} attributes={attributes}>{children}</Detail>;
  }
}

export default DetailExtension;
