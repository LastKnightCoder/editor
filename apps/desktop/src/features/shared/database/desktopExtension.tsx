import type { DatabaseImageProps } from "@tau/database";
import { defineDatabaseExtension, LinkPlugin } from "@tau/database";
import LocalImage from "@/components/LocalImage";
import { coverGradientOfKey } from "@/utils/cover";
import { RowDetailBody } from "./RowDetailBody";
import { GalleryCover } from "./GalleryCover";
import ImagePlugin from "./plugins/ImagePlugin";
import AttachmentPlugin from "./plugins/AttachmentPlugin";
import RichTextPlugin from "./plugins/RichTextPlugin";
import LinkRenderer from "./plugins/LinkRenderer";
import { useFormulaAssist } from "./useFormulaAssist";

const Image = ({ src, ...props }: DatabaseImageProps) => <LocalImage url={src} {...props} />;

/** 桌面端对 @tau/database 的宿主贡献：私有字段类型、链接渲染覆盖与 UI 插槽 */
export const desktopDatabaseExtension = defineDatabaseExtension({
  id: "tau.desktop",
  create: () => ({
    fieldTypes: [ImagePlugin, AttachmentPlugin, RichTextPlugin],
    fieldOverrides: [{ type: LinkPlugin.type, patch: { Renderer: LinkRenderer } }],
    slots: {
      RowDetailBody,
      GalleryCover,
      Image,
      coverGradient: coverGradientOfKey,
      useFormulaAssist,
    },
  }),
});
