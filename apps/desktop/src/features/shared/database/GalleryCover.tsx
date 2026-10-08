import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GalleryCoverProps } from "@/components/Database";
import { getContentById } from "@/commands/content";
import Editor from "@/components/ContentEditor";
import LocalImage from "@/components/LocalImage";
import { coverGradientOfKey } from "@/utils/cover";
import useSettingStore from "@/stores/useSettingStore";
import { bindDatabaseCommands } from "@/services/command-context";

export function GalleryCover({ row, coverType, coverImageColumnId }: GalleryCoverProps) {
  const databaseName = useSettingStore(state => state.setting.database.active);
  const commands = useMemo(
    () => bindDatabaseCommands({ getContentById }, { databaseName }),
    [databaseName]
  );
  const { data } = useQuery({
    queryKey: ["database", databaseName, "gallery-cover", row.detailContentId],
    queryFn: () => commands.getContentById(row.detailContentId!),
    enabled: coverType === "detail" && Boolean(row.detailContentId),
  });
  const preview = data?.content.slice(0, 2);
  const value = coverImageColumnId ? row[coverImageColumnId] : null;
  const image = coverType === "image" && Array.isArray(value) ? value[0] : null;
  if (coverType === "detail" && preview) {
    return (
      <div className="h-full w-full overflow-hidden p-3">
        <Editor readonly className="h-full text-sm leading-relaxed" initValue={preview} />
      </div>
    );
  }
  if (image?.url)
    return (
      <LocalImage
        url={image.url}
        alt={image.alt || "封面"}
        className="h-full w-full object-cover"
      />
    );
  return (
    <div className="absolute inset-0" style={{ backgroundImage: coverGradientOfKey(row.id) }} />
  );
}
