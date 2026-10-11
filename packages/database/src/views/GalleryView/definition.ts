import { LayoutGrid } from "lucide-react";
import GalleryView from ".";
import OptionsPanel from "./OptionsPanel";
import type { DatabaseViewDefinition } from "../types";
import type { GalleryViewConfig } from "../../types";

/** 画廊视图：封面配置收在 viewOptions.gallery，投影走通用 groupBy */
export const galleryViewDefinition: DatabaseViewDefinition<GalleryViewConfig> = {
  type: "gallery",
  name: "画廊",
  icon: LayoutGrid,
  Component: GalleryView,
  OptionsPanel,
};
