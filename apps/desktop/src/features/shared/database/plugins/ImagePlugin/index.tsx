import { CellPlugin } from "@tau/database";
import { Image } from "lucide-react";
import { Renderer } from "./components";
import { ImagePluginValue, ImagePluginConfig } from "./types";

const ImagePlugin: CellPlugin<ImagePluginConfig> = {
  type: "image",
  name: "图片",
  editable: false,
  capabilities: { images: true },
  Renderer,
  Icon: ({ className }) => <Image className={className} />,

  beforeSave: (value: ImagePluginValue) => {
    if (!Array.isArray(value)) return [];
    return value.filter(item => item && item.url);
  },

  afterLoad: (value: ImagePluginValue) => {
    if (!Array.isArray(value)) return [];
    return value.filter(item => item && item.url);
  },

  search: () => {
    // 图片不参与搜索
    return false;
  },
};

export default ImagePlugin;
