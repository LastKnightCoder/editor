import { RenderElementProps } from "slate-react";
import BulletedList from "@/components/Editor/components/BulletedList";
import { BulletedListElement } from "@/components/Editor/types";

import { withBulletedList } from './plugins';
import Base from '../base.ts';
import IExtension from "../types.ts";

class BulletedListExtension extends Base implements IExtension {
  type = 'bulleted-list';
  override getPlugins() {
    return [withBulletedList];
  }
  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <BulletedList element={element as BulletedListElement} attributes={attributes}>{children}</BulletedList>;
  }
}

export default BulletedListExtension;
