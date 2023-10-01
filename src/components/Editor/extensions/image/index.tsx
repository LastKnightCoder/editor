import Image from '@/components/Editor/components/Image';
import { RenderElementProps } from "slate-react";
import { ImageElement } from "@/components/Editor/types";

import { pasteImage } from "./plugins";
import IExtension from "../types.ts";
import Base from '../base.ts';

class ImageExtension extends Base implements IExtension {
  type = 'image';
  override getPlugins() {
    return [pasteImage];
  }
  render(props: RenderElementProps) {
    const { element, attributes, children } = props;
    return <Image element={element as ImageElement} attributes={attributes}>{children}</Image>;
  }
}

export default ImageExtension;