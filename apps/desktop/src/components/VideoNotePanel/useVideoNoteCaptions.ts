import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMemoizedFn } from "ahooks";
import { callPluginVideo } from "@/commands/plugin-video";
import { importVideoNoteCaptions } from "@/commands/video-notes";
import { useVideoProviders } from "@/hooks/useVideoProviders";
import { bindDatabaseCommands } from "@/services/command-context";
import useSettingStore from "@/stores/useSettingStore";
import { isOnlineVideoType, onlineVideoRef } from "@/types/online-video";
import { isLocalVideoMeta, isRemoteVideoMeta, type VideoNote } from "@/types";
import type { TranscriptPatch } from "./useVideoNoteTranscription";

/** 首次打开空白笔记时读取平台字幕，已保存或手动转录的内容始终优先。 */
export function useVideoNoteCaptions(
  videoNote: VideoNote | null,
  manualTranscription: boolean,
  onSaved: (patch: TranscriptPatch) => void
) {
  const database = useSettingStore(state => state.setting.database.active);
  const { providers } = useVideoProviders();
  const providerId = videoNote?.metaInfo.type;
  const hasTranscript = !!videoNote?.transcript?.trim() || !!videoNote?.transcriptSegments?.length;
  const available = isOnlineVideoType(providerId) && providers.some(item => item.id === providerId);
  const meta = videoNote?.metaInfo;
  const ref =
    meta && !isLocalVideoMeta(meta) && !isRemoteVideoMeta(meta) ? onlineVideoRef(meta) : null;
  const query = useQuery({
    queryKey: [
      "video-note-captions",
      database,
      videoNote?.id,
      videoNote?.createTime,
      providerId,
      ref,
    ],
    enabled: available && !hasTranscript && !manualTranscription,
    staleTime: Infinity,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!videoNote || !providerId || !ref) return null;
      const scoped = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
      const captions = await callPluginVideo(
        { kind: "captions", pluginId: providerId, ref },
        scoped
      );
      scoped.throwIfAborted();
      if (!captions) return null;
      const commands = bindDatabaseCommands(
        { importVideoNoteCaptions },
        { databaseName: database, signal: scoped }
      );
      const saved = await commands.importVideoNoteCaptions(
        videoNote.id,
        videoNote.updateTime,
        captions
      );
      scoped.throwIfAborted();
      return saved;
    },
  });
  const notifySaved = useMemoizedFn(onSaved);
  useEffect(() => {
    const saved = query.data;
    if (!saved || hasTranscript || manualTranscription) return;
    notifySaved({
      transcript: saved.transcript ?? "",
      transcriptSegments: saved.transcriptSegments ?? [],
      transcriptWordSegments: undefined,
    });
  }, [query.data, hasTranscript, manualTranscription, notifySaved]);
  return query.isFetching && !hasTranscript && !manualTranscription;
}
