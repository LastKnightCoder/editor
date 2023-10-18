import {RenderElementProps} from "slate-react";

import Base from "@/components/Editor/extensions/base.ts";
import IExtension from "@/components/Editor/extensions/types.ts";


class CardLink extends Base implements IExtension {
  render(props: RenderElementProps) {
    const { attributes, children } = props;

    return (
      <span {...attributes}>{children}</span>
    )
  }
}

export default CardLink;