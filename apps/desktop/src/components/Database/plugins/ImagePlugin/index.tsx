import { CellPlugin } from "../../types";
import { MdImage } from "react-icons/md";
import { Renderer } from "./components";
import { ImagePluginValue, ImagePluginConfig } from "./types";

const ImagePlugin: CellPlugin<ImagePluginConfig> = {
  type: "image",
  name: "图片",
  editable: false,
  Renderer,
  Icon: ({ className }) => <MdImage className={className} />,

  beforeSave: (value: ImagePluginValue) => {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && item.url);
  },

  afterLoad: (value: ImagePluginValue) => {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && item.url);
  },
};

export default ImagePlugin;
