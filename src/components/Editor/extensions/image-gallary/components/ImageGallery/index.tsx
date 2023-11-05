import { RenderElementProps } from "slate-react";

import VerticalImageGallery from "../VerticalImageGallery";
import { ImageGalleryElement } from "@/components/Editor/types";
import AddParagraph from "@/components/Editor/components/AddParagraph";

interface IImageGalleryProps {
  attributes: RenderElementProps['attributes'];
  element: ImageGalleryElement;
  children: RenderElementProps['children'];
}

const ImageGallery = (props: IImageGalleryProps) => {
  const { attributes, element, children } = props;

  const { images } = element;

  return (
    <div {...attributes}>
      <VerticalImageGallery items={images} />
      <AddParagraph element={element} />
      {children}
    </div>
  )
}

export default ImageGallery;
