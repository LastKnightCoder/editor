import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { GalleryCoverProps } from "@tau/database";
import { getContentById } from "@/commands/content";
import Editor from "@/components/ContentEditor";
import LocalImage from "@/components/LocalImage";
import { coverGradientOfKey } from "@/utils/cover";
import useSettingStore from "@/stores/useSettingStore";
import { bindDatabaseCommands } from "@/services/command-context";
import { defaultContentEventBus } from "@/utils/event-bus/content-event-bus";

export function GalleryCover({ row, coverType, coverImageColumnId }: GalleryCoverProps) {
  const databaseName = useSettingStore(state => state.setting.database.active);
  const queryClient = useQueryClient();
  const contentId = row.detailContentId as number | undefined;
  const queryKey = useMemo(
    () => ["database", databaseName, "gallery-cover", contentId],
    [databaseName, contentId]
  );
  const commands = useMemo(
    () => bindDatabaseCommands({ getContentById }, { databaseName }),
    [databaseName]
  );
  const { data } = useQuery({
    queryKey,
    queryFn: () => commands.getContentById(contentId!),
    enabled: coverType === "detail" && Boolean(contentId),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (coverType !== "detail" || !contentId) return;
    return defaultContentEventBus.subscribeToContent("content:updated", contentId, () => {
      if (useSettingStore.getState().setting.database.active === databaseName) {
        void queryClient.invalidateQueries({ queryKey });
      }
    });
  }, [contentId, coverType, databaseName, queryClient, queryKey]);
  const preview = useMemo(() => data?.content.slice(0, 2), [data]);
  const value = coverImageColumnId ? row[coverImageColumnId] : null;
  const image = coverType === "image" && Array.isArray(value) ? value[0] : null;
  if (coverType === "detail" && preview) {
    return (
      <div className="h-full w-full overflow-hidden p-3">
        <Editor
          key={JSON.stringify(preview)}
          readonly
          className="h-full text-sm leading-relaxed"
          initValue={preview}
        />
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
