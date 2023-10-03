import { RenderElementProps } from "slate-react";

import Detail from '@/components/Editor/components/Detail';
import { DetailElement } from "@/components/Editor/types";

import { deleteBackward } from './plugins';
import Base from '../base.ts';
import IExtension from "../types.ts";

class DetailExtension extends Base implements IExtension {
  type = 'detail';
  override getPlugins() {
    return [deleteBackward];
  }
  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <Detail element={element as DetailElement} attributes={attributes}>{children}</Detail>;
  }
}

export default DetailExtension;
