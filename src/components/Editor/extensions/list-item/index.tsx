import { RenderElementProps } from "slate-react";

import { withListItem } from "./plugins";
import Base from '../base.ts';
import IExtension from "../types.ts";

class ListItemExtension extends Base implements IExtension {
  override type = 'list-item';
  override getPlugins() {
    return [withListItem];
  }
  render(props: RenderElementProps) {
    const { attributes, children } = props;
    return <li {...attributes}>{children}</li>;
  }
}

export default ListItemExtension;