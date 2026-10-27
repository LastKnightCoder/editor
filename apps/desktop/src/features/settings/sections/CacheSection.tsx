/**
 * 剪藏与缓存 —— 第三版定稿（mockups/settings/index.html「剪藏与缓存」页）。
 *
 * 缓存桶（远程视频、在线视频、远程音频、远程图片）的列表、单条清除、多选批量删除、清除全部、
 * 视频 / 音频 / 图片预览；自动缓存三开关与网页剪藏翻译开关。
 * 版式：legacy 的 7 个折叠卡收敛为一个面板——媒体类型（形态切换）+ 来源筛选，
 * 列表只呈现当前筛选；「清除全部」作用于当前筛选涉及的桶（确认弹窗念出范围）。
 * 取源方式与 legacy 相同：各桶 list 命令 + convertFileSrc(localPath)。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Eye, Film, Image as ImageIcon, Music, Trash2 } from "lucide-react";
import {
  ROW_DIVIDER,
  SettingRow,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogBody,
  IconButton,
  ImagePreview,
  Segmented,
  Switch,
  toast,
  useEdgeFade,
} from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { convertFileSrc } from "@/commands";
import {
  clearRemoteVideoCache,
  deleteRemoteVideoCacheEntry,
  listRemoteVideoCache,
} from "@/commands/remote-video-cache";
import {
  clearRemoteImageCache,
  deleteRemoteImageCacheEntry,
  listRemoteImageCache,
} from "@/commands/remote-image-cache";
import {
  clearRemoteAudioCache,
  deleteRemoteAudioCacheEntry,
  listRemoteAudioCache,
} from "@/commands/remote-audio-cache";
import {
  clearOnlineVideoCache,
  deleteOnlineVideoCache,
  listOnlineVideoCache,
} from "@/commands/online-video-cache";
import { getVideoProviders } from "@/commands/plugin-video";
import { SettingsGroup } from "../components/SettingsGroup";

type Media = "video" | "audio" | "image";
type Source = "remote" | "online";
type SourceFilter = "all" | Source;

type BucketKey = "remoteVideo" | "onlineVideo" | "remoteAudio" | "remoteImage";

/** 桶内条目（与桶无关的统一形状；remove 闭包持有各命令所需的删除键） */
interface RawItem {
  id: string;
  name: string;
  subtitle: string;
  fileSize: number;
  localPath: string;
  remove: () => Promise<boolean>;
}

interface CacheItem extends RawItem {
  /** 全局唯一：bucket + id */
  key: string;
  bucket: BucketKey;
  previewUrl: string | null;
}

interface Bucket {
  key: BucketKey;
  media: Media;
  source: Source;
  /** 「YouTube 视频」——toast 与确认弹窗共用 */
  label: string;
  list: () => Promise<RawItem[]>;
  clear: () => Promise<void>;
}

const BUCKETS: Bucket[] = [
  {
    key: "remoteVideo",
    media: "video",
    source: "remote",
    label: "远程视频",
    list: async () =>
      (await listRemoteVideoCache()).map(item => ({
        id: item.id,
        name: item.title || item.fileName,
        subtitle: item.url,
        fileSize: item.fileSize,
        localPath: item.localPath,
        remove: () => deleteRemoteVideoCacheEntry(item.id),
      })),
    clear: clearRemoteVideoCache,
  },
  {
    key: "onlineVideo",
    media: "video",
    source: "online",
    label: "在线视频",
    list: async () => {
      const { providers } = getVideoProviders();
      return (await listOnlineVideoCache()).map(item => ({
        id: item.id,
        name: item.title || "未命名视频",
        subtitle:
          providers.find(provider => provider.id === item.providerId)?.name ?? item.providerId,
        fileSize: item.fileSize,
        localPath: item.localPath,
        remove: () => deleteOnlineVideoCache(item.id),
      }));
    },
    clear: clearOnlineVideoCache,
  },
  {
    key: "remoteAudio",
    media: "audio",
    source: "remote",
    label: "远程音频",
    list: async () =>
      (await listRemoteAudioCache()).map(item => ({
        id: item.id,
        name: item.fileName,
        subtitle: item.url,
        fileSize: item.fileSize,
        localPath: item.localPath,
        remove: () => deleteRemoteAudioCacheEntry(item.id),
      })),
    clear: clearRemoteAudioCache,
  },
  {
    key: "remoteImage",
    media: "image",
    source: "remote",
    label: "远程图片",
    list: async () =>
      (await listRemoteImageCache()).map(item => ({
        id: item.id,
        name: item.title || item.fileName,
        subtitle: item.url,
        fileSize: item.fileSize,
        localPath: item.localPath,
        remove: () => deleteRemoteImageCacheEntry(item.id),
      })),
    clear: clearRemoteImageCache,
  },
];

const BUCKET_BY_KEY = Object.fromEntries(BUCKETS.map(b => [b.key, b])) as Record<BucketKey, Bucket>;

const MEDIA_LABELS: Record<Media, string> = { video: "视频", audio: "音频", image: "图片" };
const MEDIA_ICONS = { video: Film, audio: Music, image: ImageIcon } as const;
const SOURCE_LABELS: Record<SourceFilter, string> = {
  all: "全部",
  remote: "远程",
  online: "在线视频",
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

async function loadBucket(bucket: Bucket): Promise<CacheItem[]> {
  const raw = await bucket.list();
  return Promise.all(
    raw.map(async item => {
      let previewUrl: string | null = null;
      try {
        previewUrl = await convertFileSrc(item.localPath);
      } catch (error) {
        console.error(`生成${bucket.label}缓存预览地址失败:`, error);
      }
      return { ...item, key: `${bucket.key}:${item.id}`, bucket: bucket.key, previewUrl };
    })
  );
}

export function CacheSection() {
  const translateToChinese = useSettingStore(s => s.setting.misc.webClip.translateToChinese);
  const autoCacheVideo = useSettingStore(s => s.setting.misc.video.autoCacheRemote);
  const autoCacheAudio = useSettingStore(s => s.setting.misc.audio.autoCacheRemote);
  const autoCacheImage = useSettingStore(s => s.setting.misc.image.autoCacheRemote);
  const setTranslateToChinese = useSettingStore(s => s.setWebClipTranslateToChinese);
  const setAutoCacheVideo = useSettingStore(s => s.setAutoCacheRemoteVideo);
  const setAutoCacheAudio = useSettingStore(s => s.setAutoCacheRemoteAudio);
  const setAutoCacheImage = useSettingStore(s => s.setAutoCacheRemoteImage);

  /* 各桶条目：undefined = 首次读取中 */
  const [caches, setCaches] = useState<Partial<Record<BucketKey, CacheItem[]>>>({});

  const refresh = useCallback(async (key: BucketKey) => {
    const bucket = BUCKET_BY_KEY[key];
    try {
      const items = await loadBucket(bucket);
      setCaches(prev => ({ ...prev, [key]: items }));
    } catch (error) {
      console.error(`加载${bucket.label}缓存失败:`, error);
      toast.error(`加载${bucket.label}缓存失败`);
      setCaches(prev => ({ ...prev, [key]: prev[key] ?? [] }));
    }
  }, []);

  useEffect(() => {
    BUCKETS.forEach(bucket => void refresh(bucket.key));
  }, [refresh]);

  /* ── 筛选：媒体类型（形态）+ 来源；图片只有远程一源，来源筛选不渲染 ── */
  const [media, setMedia] = useState<Media>("video");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const source: SourceFilter = media === "image" ? "all" : sourceFilter;

  const mediaBuckets = useMemo(() => BUCKETS.filter(b => b.media === media), [media]);
  const visibleBuckets = useMemo(
    () => mediaBuckets.filter(b => source === "all" || b.source === source),
    [mediaBuckets, source]
  );
  const items = useMemo(
    () => visibleBuckets.flatMap(b => caches[b.key] ?? []),
    [visibleBuckets, caches]
  );
  const loading = visibleBuckets.some(b => caches[b.key] === undefined);
  const totalSize = useMemo(() => items.reduce((sum, i) => sum + (i.fileSize || 0), 0), [items]);
  const sourceCount = (filter: SourceFilter) =>
    mediaBuckets
      .filter(b => filter === "all" || b.source === filter)
      .reduce((sum, b) => sum + (caches[b.key]?.length ?? 0), 0);

  /* ── 多选：切换筛选即清空（批量删除只作用于当前列表可见项） ── */
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  useEffect(() => setSelected(new Set()), [media, source]);
  const selectedItems = useMemo(() => items.filter(i => selected.has(i.key)), [items, selected]);
  const allSelected = items.length > 0 && selectedItems.length === items.length;

  const toggleRow = (key: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map(i => i.key)));

  /* ── 删除 ── */
  const [deleting, setDeleting] = useState<Set<string>>(() => new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  const markDeleting = (key: string, on: boolean) =>
    setDeleting(prev => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const handleDeleteRow = async (item: CacheItem) => {
    const { label } = BUCKET_BY_KEY[item.bucket];
    markDeleting(item.key, true);
    try {
      const removed = await item.remove();
      if (removed) toast.success(`已删除该${label}缓存`);
      else toast.warning("缓存记录不存在，可能已被移除");
      setSelected(prev => {
        if (!prev.has(item.key)) return prev;
        const next = new Set(prev);
        next.delete(item.key);
        return next;
      });
      await refresh(item.bucket);
    } catch (error) {
      console.error(`删除${label}缓存失败:`, error);
      toast.error(`删除${label}缓存失败`);
    } finally {
      markDeleting(item.key, false);
    }
  };

  /* 批量删除：与 legacy 一致逐条串行调用单条删除命令，结束后清空选择；回执合并为一条 */
  const handleBatchDelete = async () => {
    const targets = selectedItems;
    if (!targets.length) return;
    setBatchDeleting(true);
    let removed = 0;
    let failed = 0;
    try {
      for (const item of targets) {
        try {
          if (await item.remove()) removed += 1;
        } catch (error) {
          failed += 1;
          console.error(`删除${BUCKET_BY_KEY[item.bucket].label}缓存失败:`, error);
        }
      }
      await Promise.all([...new Set(targets.map(i => i.bucket))].map(refresh));
      setSelected(new Set());
      if (failed > 0) toast.error(`${failed} 项删除失败，已删除 ${removed} 项`);
      else if (removed < targets.length)
        toast.warning(`已删除 ${removed} 项，其余记录不存在，可能已被移除`);
      else toast.success(`已删除 ${removed} 项缓存`);
    } finally {
      setBatchDeleting(false);
    }
  };

  /* 清除全部：作用于当前筛选涉及的桶 */
  const [clearOpen, setClearOpen] = useState(false);
  const clearScope = visibleBuckets.map(b => b.label).join("、");
  const handleClearAll = async () => {
    const results = await Promise.allSettled(visibleBuckets.map(b => b.clear()));
    await Promise.all(visibleBuckets.map(b => refresh(b.key)));
    setSelected(new Set());
    const failedLabels = visibleBuckets
      .filter((_, index) => results[index].status === "rejected")
      .map(b => b.label);
    results.forEach((result, index) => {
      if (result.status === "rejected")
        console.error(`清除${visibleBuckets[index].label}缓存失败:`, result.reason);
    });
    if (failedLabels.length) toast.error(`清除${failedLabels.join("、")}缓存失败`);
    else toast.success(`已清空${clearScope}缓存`);
  };

  /* ── 预览：视频 / 音频走 Dialog 承载原生播放器，图片走 ImagePreview（可左右切换） ── */
  const [player, setPlayer] = useState<{ kind: "video" | "audio"; title: string; src: string }>();
  const [playerOpen, setPlayerOpen] = useState(false);
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const closePlayer = (open: boolean) => {
    if (open) return;
    mediaRef.current?.pause();
    setPlayerOpen(false);
  };

  const previewImages = useMemo(
    () =>
      media === "image"
        ? items.flatMap(i => (i.previewUrl ? [{ key: i.key, src: i.previewUrl, alt: i.name }] : []))
        : [],
    [media, items]
  );
  const [imageIndex, setImageIndex] = useState(0);
  const [imageOpen, setImageOpen] = useState(false);

  const handlePreview = (item: CacheItem) => {
    if (!item.previewUrl) return;
    if (media === "image") {
      setImageIndex(
        Math.max(
          0,
          previewImages.findIndex(i => i.key === item.key)
        )
      );
      setImageOpen(true);
      return;
    }
    setPlayer({ kind: media, title: item.name, src: item.previewUrl });
    setPlayerOpen(true);
  };

  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(listEl);

  const Icon = MEDIA_ICONS[media];
  const mediaLabel = MEDIA_LABELS[media];

  return (
    <>
      <SettingsGroup title="缓存" description="清除只删除本地缓存文件，再次播放或加载时会重新下载">
        <div className="flex flex-wrap items-center gap-2 p-2">
          <Segmented
            label="媒体类型"
            size="sm"
            value={media}
            onValueChange={v => setMedia(v as Media)}
          >
            {(Object.keys(MEDIA_LABELS) as Media[]).map(key => (
              <Segmented.Item key={key} value={key} label={MEDIA_LABELS[key]} />
            ))}
          </Segmented>
          {media !== "image" && (
            <Segmented
              label="来源筛选"
              size="sm"
              value={source}
              onValueChange={v => setSourceFilter(v as SourceFilter)}
            >
              {(Object.keys(SOURCE_LABELS) as SourceFilter[]).map(key => (
                <Segmented.Item
                  key={key}
                  value={key}
                  label={`${SOURCE_LABELS[key]} ${sourceCount(key)}`}
                />
              ))}
            </Segmented>
          )}
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            icon={Trash2}
            className="text-danger hover:text-danger"
            disabled={items.length === 0}
            onClick={() => setClearOpen(true)}
          >
            清除全部
          </Button>
        </div>

        {loading && items.length === 0 ? (
          <div className="text-tau-meta text-ink-2 px-3 py-6 text-center">正在读取缓存…</div>
        ) : items.length === 0 ? (
          <div className="text-tau-meta text-ink-2 px-3 py-6 text-center">
            暂无{source === "all" ? "" : SOURCE_LABELS[source]}
            {mediaLabel}缓存
          </div>
        ) : (
          <>
            <div className="flex min-h-10 items-center gap-2 px-3 pb-1">
              <Checkbox
                aria-label="全选"
                checked={allSelected}
                indeterminate={selectedItems.length > 0 && !allSelected}
                onChange={toggleAll}
              />
              {selectedItems.length > 0 ? (
                <>
                  <span className="text-tau-meta text-ink-1 tabular-nums">
                    已选 {selectedItems.length} 项
                  </span>
                  <span className="flex-1" />
                  <Button
                    variant="danger-soft"
                    size="sm"
                    icon={Trash2}
                    loading={batchDeleting}
                    loadingText="删除中…"
                    onClick={() => void handleBatchDelete()}
                  >
                    批量删除
                  </Button>
                </>
              ) : (
                <span className="text-tau-meta text-ink-2 tabular-nums">
                  共 {items.length} 项 · 占用{" "}
                  <span className="text-ink-1 font-medium">{formatBytes(totalSize)}</span>
                </span>
              )}
            </div>
            <div
              ref={setListEl}
              className="edge-fade-scroll max-h-[400px] overflow-x-hidden overflow-y-auto"
            >
              {items.map(item => (
                <CacheRow
                  key={item.key}
                  item={item}
                  icon={Icon}
                  sourceLabel={
                    media === "image" ? null : SOURCE_LABELS[BUCKET_BY_KEY[item.bucket].source]
                  }
                  selected={selected.has(item.key)}
                  deleting={deleting.has(item.key) || batchDeleting}
                  onToggle={() => toggleRow(item.key)}
                  onPreview={() => handlePreview(item)}
                  onDelete={() => void handleDeleteRow(item)}
                />
              ))}
            </div>
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title="自动缓存" description="离线也能打开，会占用本地空间">
        <SettingRow
          title="远程视频"
          description="普通网络视频链接播放时自动缓存到本地；Bilibili、YouTube 等在线视频始终先缓存再播放，不受此开关影响"
        >
          <Switch
            aria-label="自动缓存远程视频"
            checked={autoCacheVideo}
            onCheckedChange={setAutoCacheVideo}
          />
        </SettingRow>
        <SettingRow
          title="远程音频"
          description="关闭后播放远程音频直接使用在线链接，不写入本地缓存"
        >
          <Switch
            aria-label="自动缓存远程音频"
            checked={autoCacheAudio}
            onCheckedChange={setAutoCacheAudio}
          />
        </SettingRow>
        <SettingRow
          title="远程图片"
          description="关闭后加载远程图片直接使用在线链接，不写入本地缓存"
        >
          <Switch
            aria-label="自动缓存远程图片"
            checked={autoCacheImage}
            onCheckedChange={setAutoCacheImage}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="网页剪藏">
        <SettingRow title="解析时翻译为中文" description="解析网页时尝试将正文自动翻译为中文">
          <Switch
            aria-label="解析时翻译为中文"
            checked={translateToChinese}
            onCheckedChange={setTranslateToChinese}
          />
        </SettingRow>
      </SettingsGroup>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="清除缓存"
        context={`${mediaLabel} · ${source === "all" ? "全部来源" : SOURCE_LABELS[source]}`}
        danger
        confirmText="清除"
        description={`将清空${clearScope}缓存。仅删除本地缓存文件，原始内容不受影响，再次播放或加载时会重新下载。`}
        impact={`共 ${items.length} 项，释放 ${formatBytes(totalSize)}`}
        onConfirm={handleClearAll}
      />

      <Dialog
        open={playerOpen}
        onOpenChange={closePlayer}
        onAfterClose={() => setPlayer(undefined)}
        title={player?.title || (player?.kind === "audio" ? "音频预览" : "视频预览")}
        width={player?.kind === "audio" ? 480 : 720}
      >
        <DialogBody>
          {player?.kind === "video" && (
            <video
              ref={mediaRef}
              src={player.src}
              controls
              className="rounded-tau-sm max-h-[70vh] w-full"
            />
          )}
          {player?.kind === "audio" && (
            <audio ref={mediaRef} src={player.src} controls className="w-full" />
          )}
        </DialogBody>
      </Dialog>

      <ImagePreview
        images={previewImages}
        index={imageIndex}
        onIndexChange={setImageIndex}
        open={imageOpen}
        onOpenChange={setImageOpen}
      />
    </>
  );
}

function CacheRow({
  item,
  icon: Icon,
  sourceLabel,
  selected,
  deleting,
  onToggle,
  onPreview,
  onDelete,
}: {
  item: CacheItem;
  icon: typeof Film;
  sourceLabel: string | null;
  selected: boolean;
  deleting: boolean;
  onToggle: () => void;
  onPreview: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={clsx("rounded-tau-sm flex min-h-[52px] items-center gap-3 px-3 py-2", ROW_DIVIDER)}
    >
      <Checkbox aria-label={`选择「${item.name}」`} checked={selected} onChange={onToggle} />
      <span className="bg-hover text-ink-2 rounded-tau-sm grid size-8 shrink-0 place-items-center">
        <Icon size={15} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-ink-1 truncate font-medium" title={item.name}>
          {item.name}
        </div>
        <div className="text-tau-meta text-ink-2 truncate" title={`缓存路径：${item.localPath}`}>
          {sourceLabel ? `${sourceLabel} · ` : ""}
          {item.subtitle}
        </div>
      </div>
      <span className="text-tau-meta text-ink-2 shrink-0 tabular-nums">
        {formatBytes(item.fileSize)}
      </span>
      <div className="flex shrink-0 gap-0.5">
        <IconButton
          aria-label={`预览「${item.name}」`}
          title={item.previewUrl ? "预览" : "暂无可用预览"}
          disabled={!item.previewUrl}
          onClick={onPreview}
        >
          <Eye size={14} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          aria-label={`清除「${item.name}」`}
          title="清除"
          disabled={deleting}
          onClick={onDelete}
        >
          <Trash2 size={14} strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}
