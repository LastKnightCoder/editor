import { useMemo, useState } from "react";
import { Download, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog, IconButton, Menu, cn, toast } from "@tau/ui";
import LocalAudio from "@/components/LocalAudio";
import { getHomeDir, readBinaryFile } from "@/commands";
import { saveFileWithDialog } from "@/commands/extra";
import { getFileExtension, remoteResourceToLocal } from "@/utils/resouce";
import type { IPodcast } from "@/types/podcast";
import PodcastScript from "./PodcastScript";
import { buildSpeakerSegments, buildSpeakerTones, type SpeakerTone } from "./speakers";

interface PodcastPlayerProps {
  podcast: IPodcast;
  /** 打开生成/编辑弹窗；不传则菜单不出现「编辑」 */
  onEdit?: () => void;
  /** 删除播客（播放器内已确认）；不传则菜单不出现「删除」 */
  onDelete?: () => Promise<void> | void;
  className?: string;
}

const AVATAR_CLASSES: Record<SpeakerTone, string> = {
  1: "bg-tag-1-soft text-tag-1",
  2: "bg-tag-2-soft text-tag-2",
  3: "bg-tag-3-soft text-tag-3",
  4: "bg-tag-4-soft text-tag-4",
  5: "bg-tag-5-soft text-tag-5",
};

const iconProps = { className: "size-4", strokeWidth: 1.75 } as const;

/** 播客音频读成字节：远程地址先走本地缓存（WebDAV 需鉴权，不能直接下载） */
const readPodcastAudio = async (audioUrl: string) => {
  let path = audioUrl;
  if (audioUrl.startsWith("http")) {
    path = await remoteResourceToLocal(audioUrl);
  } else if (audioUrl.startsWith("~")) {
    path = `${await getHomeDir()}${audioUrl.slice(1)}`;
  }
  return readBinaryFile(path);
};

/**
 * 播客播放器：Audio 波形卡 + 说话人分色波形 + 脚本跟读。
 * 时长取库里记录值先行显示，音频由 LocalAudio 流式加载，不阻塞卡片渲染。
 */
const PodcastPlayer = ({ podcast, onEdit, onDelete, className }: PodcastPlayerProps) => {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const lines = useMemo(() => podcast.scriptLines ?? [], [podcast.scriptLines]);
  const tones = useMemo(
    () => buildSpeakerTones(podcast.speakers, lines),
    [podcast.speakers, lines]
  );
  const segments = useMemo(() => buildSpeakerSegments(lines, tones), [lines, tones]);
  const title = podcast.name || "未命名播客";

  const downloadAudio = async () => {
    try {
      const ext = (await getFileExtension(podcast.audioUrl)) || "wav";
      const result = await saveFileWithDialog({
        defaultFileName: `${title}.${ext}`,
        data: await readPodcastAudio(podcast.audioUrl),
      });
      if (!result.canceled) toast.success("音频已保存");
    } catch (error) {
      console.error("[PodcastPlayer] 下载失败", error);
      toast.error("下载音频失败");
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete?.();
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const info = podcast.speakers.length > 0 && (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex shrink-0">
        {podcast.speakers.map((speaker, index) => (
          <span
            key={speaker.name}
            className={cn(
              "ring-surface grid size-[18px] place-items-center rounded-full text-[10px] font-semibold ring-[1.5px]",
              AVATAR_CLASSES[tones.get(speaker.name) ?? 1],
              index > 0 && "-ml-[5px]"
            )}
          >
            {speaker.name.slice(0, 1)}
          </span>
        ))}
      </span>
      <span className="truncate">{podcast.speakers.map(speaker => speaker.name).join("、")}</span>
    </span>
  );

  const actions = (
    <Menu
      align="end"
      className="w-44"
      trigger={
        <IconButton aria-label="更多" className="size-[30px] shrink-0">
          <MoreHorizontal {...iconProps} />
        </IconButton>
      }
    >
      {onEdit && (
        <Menu.Item icon={<Pencil {...iconProps} />} onSelect={onEdit}>
          编辑播客
        </Menu.Item>
      )}
      <Menu.Item icon={<Download {...iconProps} />} onSelect={() => void downloadAudio()}>
        下载音频
      </Menu.Item>
      {onDelete && (
        <>
          <Menu.Separator />
          <Menu.Item danger icon={<Trash2 {...iconProps} />} onSelect={() => setDeleteOpen(true)}>
            删除播客
          </Menu.Item>
        </>
      )}
    </Menu>
  );

  return (
    <>
      <LocalAudio
        src={podcast.audioUrl}
        label={title}
        info={info}
        durationHint={podcast.duration}
        segments={segments}
        actions={actions}
        className={className}
        footer={({ currentTime, playFrom }) => (
          <PodcastScript
            lines={lines}
            fallbackScript={podcast.script}
            tones={tones}
            currentTime={currentTime}
            onSeek={playFrom}
          />
        )}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={open => {
          if (!open) setDeleteOpen(false);
        }}
        title="删除播客"
        context={title}
        description="将删除音频与脚本。"
        impact="生成记录不可恢复，重新生成需再次调用语音服务"
        danger
        confirmText="删除"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
};

export default PodcastPlayer;
