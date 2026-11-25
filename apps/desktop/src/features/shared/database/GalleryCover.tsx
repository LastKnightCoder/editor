import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { GalleryCoverProps } from "@tau/database";
import { getContentById } from "@/commands/content";
import Editor from "@/components/ContentEditor";
import LocalImage from "@/components/LocalImage";
import { coverGradientOfKey } from "@/utils/cover";
import useSettingStore from "@/stores/useSettingStore";
import { databaseQueryKey } from "@/services/command-context";
import { useDatabaseCommands } from "@/hooks/useDatabaseCommands";
import { defaultContentEventBus } from "@/utils/event-bus/content-event-bus";

const contentCommands = { getContentById };

export function GalleryCover({ row, coverType, coverImageColumnId }: GalleryCoverProps) {
  const databaseName = useSettingStore(state => state.setting.database.active);
  const queryClient = useQueryClient();
  const contentId = row.detailContentId as number | undefined;
  const { commands, connectionId } = useDatabaseCommands(contentCommands, databaseName);
  const queryKey = useMemo(
    () => databaseQueryKey(["database", databaseName, "gallery-cover", contentId], connectionId),
    [databaseName, contentId, connectionId]
  );
  const { data } = useQuery({
    queryKey,
    queryFn: () => commands.getContentById(contentId ?? 0),
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
