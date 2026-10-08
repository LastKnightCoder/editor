import { forwardRef, useMemo, useState } from "react";
import Database, {
  LinkPlugin,
  type DatabaseProps,
  type DatabaseRef,
  type DatabaseImageProps,
  type DatabaseSlots,
} from "@/components/Database";
import LocalImage from "@/components/LocalImage";
import { deleteContent } from "@/commands/content";
import { bindDatabaseCommands } from "@/services/command-context";
import useSettingStore from "@/stores/useSettingStore";
import { coverGradientOfKey } from "@/utils/cover";
import { RowDetailBody } from "./RowDetailBody";
import { GalleryCover } from "./GalleryCover";
import ImagePlugin from "./plugins/ImagePlugin";
import AttachmentPlugin from "./plugins/AttachmentPlugin";
import RichTextPlugin from "./plugins/RichTextPlugin";
import LinkRenderer from "./plugins/LinkRenderer";

const Image = ({ src, ...props }: DatabaseImageProps) => <LocalImage url={src} {...props} />;

export const desktopDatabaseSlots: DatabaseSlots = {
  RowDetailBody,
  GalleryCover,
  Image,
  coverGradient: coverGradientOfKey,
};

const desktopPlugins = [
  ImagePlugin,
  AttachmentPlugin,
  RichTextPlugin,
  { ...LinkPlugin, Renderer: LinkRenderer },
] as NonNullable<DatabaseProps["plugins"]>;

export const DesktopDatabase = forwardRef<DatabaseRef, DatabaseProps>(
  ({ plugins, slots, onRowCleanup, ...props }, ref) => {
    const [databaseName] = useState(() => useSettingStore.getState().setting.database.active);
    const commands = useMemo(
      () => bindDatabaseCommands({ deleteContent }, { databaseName }),
      [databaseName]
    );
    const combinedPlugins = useMemo(() => [...desktopPlugins, ...(plugins ?? [])], [plugins]);
    return (
      <Database
        {...props}
        ref={ref}
        plugins={combinedPlugins}
        slots={{ ...desktopDatabaseSlots, ...slots }}
        onRowCleanup={async row => {
          if (row.detailContentId && row.detailContentId > 0)
            await commands.deleteContent(row.detailContentId);
          await onRowCleanup?.(row);
        }}
      />
    );
  }
);

DesktopDatabase.displayName = "DesktopDatabase";
