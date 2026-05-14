import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { App } from "antd";
import { AnimatePresence, motion } from "motion/react";
import useSettingStore from "@/stores/useSettingStore";
import {
  SettingButton,
  SettingContainer,
  SettingSection,
  SettingSwitch,
} from "../components";
import CustomCheckbox from "@/components/CustomCheckbox";
import CustomModal from "@/components/CustomModal";
import { convertFileSrc } from "@/commands";
import {
  listRemoteVideoCache,
  deleteRemoteVideoCacheEntry,
  clearRemoteVideoCache,
  type RemoteVideoCacheEntry,
} from "@/commands/remote-video-cache";
import {
  listRemoteImageCache,
  deleteRemoteImageCacheEntry,
  clearRemoteImageCache,
  type RemoteImageCacheEntry,
} from "@/commands/remote-image-cache";
import {
  listRemoteAudioCache,
  deleteRemoteAudioCacheEntry,
  clearRemoteAudioCache,
  type RemoteAudioCacheEntry,
} from "@/commands/remote-audio-cache";
import {
  listYoutubeAudioCache,
  deleteYoutubeAudioCache,
  clearYoutubeAudioCache,
  type YoutubeAudioCacheEntry,
} from "@/commands/youtube-audio-cache";
import {
  listBilibiliAudioCache,
  deleteBilibiliAudioCache,
  clearBilibiliAudioCache,
  type BilibiliAudioCacheEntry,
} from "@/commands/bilibili-audio-cache";
import {
  listYoutubeCache,
  deleteYoutubeCache,
  clearYoutubeCache,
} from "@/commands/youtube-cache";
import {
  listBilibiliCache,
  deleteBilibiliCache,
  clearBilibiliCache,
} from "@/commands/bilibili-cache";
import {
  listNotionCache,
  deleteNotionCache,
  clearNotionCache,
} from "@/commands/notion-cache";

type YoutubeCacheItem = Awaited<ReturnType<typeof listYoutubeCache>>[number];
type BilibiliCacheItem = Awaited<ReturnType<typeof listBilibiliCache>>[number];
type NotionCacheItem = Awaited<ReturnType<typeof listNotionCache>>[number];

type CacheSectionKey =
  | "remote"
  | "youtube"
  | "bilibili"
  | "notion"
  | "image"
  | "audio"
  | "youtubeAudio"
  | "bilibiliAudio";

interface CacheRow<TPayload = unknown> {
  id: string;
  name: string;
  subtitle?: string;
  sizeLabel?: string;
  payload: TPayload;
}

const formatBytes = (bytes?: number) => {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

interface RemoteCacheItem extends RemoteVideoCacheEntry {
  previewUrl: string | null;
}

interface RemoteImageCacheItem extends RemoteImageCacheEntry {
  previewUrl: string | null;
}

interface RemoteAudioCacheItem extends RemoteAudioCacheEntry {
  previewUrl: string | null;
}

interface YoutubeAudioCacheItem extends YoutubeAudioCacheEntry {
  previewUrl: string | null;
}

interface BilibiliAudioCacheItem extends BilibiliAudioCacheEntry {
  previewUrl: string | null;
}

type YoutubeCacheWithPreview = YoutubeCacheItem & {
  previewUrl: string | null;
};

type BilibiliCacheWithPreview = BilibiliCacheItem & {
  previewUrl: string | null;
};

type NotionCacheWithPreview = NotionCacheItem & {
  previewUrl: string | null;
};

const MiscSetting = () => {
  const { message } = App.useApp();

  const {
    translateToChinese,
    setWebClipTranslateToChinese,
    autoCacheRemoteVideo,
    setAutoCacheRemoteVideo,
    autoCacheRemoteImage,
    setAutoCacheRemoteImage,
    autoCacheRemoteAudio,
    setAutoCacheRemoteAudio,
  } = useSettingStore((state) => ({
    translateToChinese: state.setting.misc.webClip.translateToChinese,
    setWebClipTranslateToChinese: state.setWebClipTranslateToChinese,
    autoCacheRemoteVideo: state.setting.misc.video.autoCacheRemote,
    setAutoCacheRemoteVideo: state.setAutoCacheRemoteVideo,
    autoCacheRemoteImage: state.setting.misc.image.autoCacheRemote,
    setAutoCacheRemoteImage: state.setAutoCacheRemoteImage,
    autoCacheRemoteAudio: state.setting.misc.audio.autoCacheRemote,
    setAutoCacheRemoteAudio: state.setAutoCacheRemoteAudio,
  }));

  const [remoteCache, setRemoteCache] = useState<RemoteCacheItem[]>([]);
  const [imageCache, setImageCache] = useState<RemoteImageCacheItem[]>([]);
  const [audioCache, setAudioCache] = useState<RemoteAudioCacheItem[]>([]);
  const [youtubeAudioCache, setYoutubeAudioCache] = useState<
    YoutubeAudioCacheItem[]
  >([]);
  const [bilibiliAudioCache, setBilibiliAudioCache] = useState<
    BilibiliAudioCacheItem[]
  >([]);
  const [youtubeCache, setYoutubeCache] = useState<YoutubeCacheWithPreview[]>(
    [],
  );
  const [bilibiliCache, setBilibiliCache] = useState<
    BilibiliCacheWithPreview[]
  >([]);
  const [notionCache, setNotionCache] = useState<NotionCacheWithPreview[]>([]);
  const [clearing, setClearing] = useState<Record<CacheSectionKey, boolean>>({
    remote: false,
    image: false,
    audio: false,
    youtubeAudio: false,
    bilibiliAudio: false,
    youtube: false,
    bilibili: false,
    notion: false,
  });
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [batchDeleting, setBatchDeleting] = useState<
    Record<CacheSectionKey, boolean>
  >({
    remote: false,
    image: false,
    audio: false,
    youtubeAudio: false,
    bilibiliAudio: false,
    youtube: false,
    bilibili: false,
    notion: false,
  });
  const [expandedSections, setExpandedSections] = useState<
    Record<CacheSectionKey, boolean>
  >({
    remote: false,
    image: false,
    audio: false,
    youtubeAudio: false,
    bilibiliAudio: false,
    youtube: false,
    bilibili: false,
    notion: false,
  });
  const [selectedRows, setSelectedRows] = useState<
    Record<CacheSectionKey, Set<string>>
  >(() => ({
    remote: new Set(),
    image: new Set(),
    audio: new Set(),
    youtubeAudio: new Set(),
    bilibiliAudio: new Set(),
    youtube: new Set(),
    bilibili: new Set(),
    notion: new Set(),
  }));
  const [previewModal, setPreviewModal] = useState<{
    open: boolean;
    title: string;
    src: string | null;
  }>({
    open: false,
    title: "",
    src: null,
  });
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [imagePreview, setImagePreview] = useState<{
    open: boolean;
    src: string | null;
    title: string;
  }>({
    open: false,
    src: null,
    title: "",
  });
  const [audioPreview, setAudioPreview] = useState<{
    open: boolean;
    src: string | null;
    title: string;
  }>({
    open: false,
    src: null,
    title: "",
  });

  const setBatchDeletingState = useCallback(
    (key: CacheSectionKey, value: boolean) => {
      setBatchDeleting((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const toggleSection = useCallback((key: CacheSectionKey) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const updateSelection = useCallback(
    (key: CacheSectionKey, updater: (set: Set<string>) => void) => {
      setSelectedRows((prev) => {
        const next = { ...prev, [key]: new Set(prev[key]) };
        updater(next[key]);
        return next;
      });
    },
    [],
  );

  const clearSelection = useCallback(
    (key: CacheSectionKey) => {
      updateSelection(key, (set) => set.clear());
    },
    [updateSelection],
  );

  const setClearingState = useCallback(
    (key: CacheSectionKey, value: boolean) => {
      setClearing((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const refreshRemoteCache = useCallback(async () => {
    try {
      const data = await listRemoteVideoCache();
      const enhanced = await Promise.all(
        data.map(async (item) => {
          let previewUrl: string | null = null;
          try {
            previewUrl = await convertFileSrc(item.localPath);
          } catch (error) {
            console.error("生成远程视频预览地址失败:", error);
          }
          return {
            ...item,
            previewUrl,
          };
        }),
      );
      setRemoteCache(enhanced);
    } catch (error) {
      console.error("加载远程视频缓存失败:", error);
      message.error("加载远程视频缓存失败");
    }
  }, [message]);

  const refreshImageCache = useCallback(async () => {
    try {
      const data = await listRemoteImageCache();
      const enhanced = await Promise.all(
        data.map(async (item) => {
          let previewUrl: string | null = null;
          try {
            previewUrl = await convertFileSrc(item.localPath);
          } catch (error) {
            console.error("生成图片缓存预览失败:", error);
          }
          return {
            ...item,
            previewUrl,
          };
        }),
      );
      setImageCache(enhanced);
    } catch (error) {
      console.error("加载图片缓存失败:", error);
      message.error("加载图片缓存失败");
    }
  }, [message]);

  const refreshAudioCache = useCallback(async () => {
    try {
      const data = await listRemoteAudioCache();
      const enhanced = await Promise.all(
        data.map(async (item) => {
          let previewUrl: string | null = null;
          try {
            previewUrl = await convertFileSrc(item.localPath);
          } catch (error) {
            console.error("生成音频缓存预览失败:", error);
          }
          return {
            ...item,
            previewUrl,
          };
        }),
      );
      setAudioCache(enhanced);
    } catch (error) {
      console.error("加载音频缓存失败:", error);
      message.error("加载音频缓存失败");
    }
  }, [message]);

  const refreshYoutubeAudioCache = useCallback(async () => {
    try {
      const data = await listYoutubeAudioCache();
      const enhanced = await Promise.all(
        data.map(async (item) => {
          let previewUrl: string | null = null;
          try {
            previewUrl = await convertFileSrc(item.localPath);
          } catch (error) {
            console.error("生成 YouTube 音频缓存预览失败:", error);
          }
          return {
            ...item,
            previewUrl,
          };
        }),
      );
      setYoutubeAudioCache(enhanced);
    } catch (error) {
      console.error("加载 YouTube 音频缓存失败:", error);
      message.error("加载 YouTube 音频缓存失败");
    }
  }, [message]);

  const refreshBilibiliAudioCache = useCallback(async () => {
    try {
      const data = await listBilibiliAudioCache();
      const enhanced = await Promise.all(
        data.map(async (item) => {
          let previewUrl: string | null = null;
          try {
            previewUrl = await convertFileSrc(item.localPath);
          } catch (error) {
            console.error("生成 Bilibili 音频缓存预览失败:", error);
          }
          return {
            ...item,
            previewUrl,
          };
        }),
      );
      setBilibiliAudioCache(enhanced);
    } catch (error) {
      console.error("加载 Bilibili 音频缓存失败:", error);
      message.error("加载 Bilibili 音频缓存失败");
    }
  }, [message]);

  const refreshYoutubeCache = useCallback(async () => {
    try {
      const data = await listYoutubeCache();
      const enhanced = await Promise.all(
        data.map(async (item) => {
          let previewUrl: string | null = null;
          try {
            previewUrl = await convertFileSrc(item.localPath);
          } catch (error) {
            console.error("生成 YouTube 缓存预览失败:", error);
          }
          return {
            ...item,
            previewUrl,
          };
        }),
      );
      setYoutubeCache(enhanced);
    } catch (error) {
      console.error("加载 YouTube 视频缓存失败:", error);
      message.error("加载 YouTube 视频缓存失败");
    }
  }, [message]);

  const refreshBilibiliCache = useCallback(async () => {
    try {
      const data = await listBilibiliCache();
      const enhanced = await Promise.all(
        data.map(async (item) => {
          let previewUrl: string | null = null;
          try {
            previewUrl = await convertFileSrc(item.localPath);
          } catch (error) {
            console.error("生成 Bilibili 缓存预览失败:", error);
          }
          return {
            ...item,
            previewUrl,
          };
        }),
      );
      setBilibiliCache(enhanced);
    } catch (error) {
      console.error("加载 Bilibili 视频缓存失败:", error);
      message.error("加载 Bilibili 视频缓存失败");
    }
  }, [message]);

  const refreshNotionCache = useCallback(async () => {
    try {
      const data = await listNotionCache();
      const enhanced = await Promise.all(
        data.map(async (item) => {
          let previewUrl: string | null = null;
          try {
            previewUrl = await convertFileSrc(item.localPath);
          } catch (error) {
            console.error("生成 Notion 缓存预览失败:", error);
          }
          return {
            ...item,
            previewUrl,
          };
        }),
      );
      setNotionCache(enhanced);
    } catch (error) {
      console.error("加载 Notion 视频缓存失败:", error);
      message.error("加载 Notion 视频缓存失败");
    }
  }, [message]);

  useEffect(() => {
    void (async () => {
      await Promise.all([
        refreshRemoteCache(),
        refreshImageCache(),
        refreshAudioCache(),
        refreshYoutubeAudioCache(),
        refreshBilibiliAudioCache(),
        refreshYoutubeCache(),
        refreshBilibiliCache(),
        refreshNotionCache(),
      ]);
    })();
  }, [
    refreshRemoteCache,
    refreshImageCache,
    refreshAudioCache,
    refreshYoutubeAudioCache,
    refreshBilibiliAudioCache,
    refreshYoutubeCache,
    refreshBilibiliCache,
    refreshNotionCache,
  ]);

  const handleClearRemoteCache = useCallback(async () => {
    setClearingState("remote", true);
    try {
      await clearRemoteVideoCache();
      await refreshRemoteCache();
      message.success("已清空远程视频缓存");
    } catch (error) {
      console.error("清除远程视频缓存失败:", error);
      message.error("清除远程视频缓存失败");
    } finally {
      setClearingState("remote", false);
    }
  }, [message, refreshRemoteCache, setClearingState]);

  const handleClearImageCache = useCallback(async () => {
    setClearingState("image", true);
    try {
      await clearRemoteImageCache();
      await refreshImageCache();
      message.success("已清空图片缓存");
    } catch (error) {
      console.error("清除图片缓存失败:", error);
      message.error("清除图片缓存失败");
    } finally {
      setClearingState("image", false);
    }
  }, [message, refreshImageCache, setClearingState]);

  const handleClearAudioCache = useCallback(async () => {
    setClearingState("audio", true);
    try {
      await clearRemoteAudioCache();
      await refreshAudioCache();
      message.success("已清空音频缓存");
    } catch (error) {
      console.error("清除音频缓存失败:", error);
      message.error("清除音频缓存失败");
    } finally {
      setClearingState("audio", false);
    }
  }, [message, refreshAudioCache, setClearingState]);

  const handleClearYoutubeAudioCache = useCallback(async () => {
    setClearingState("youtubeAudio", true);
    try {
      await clearYoutubeAudioCache();
      await refreshYoutubeAudioCache();
      message.success("已清空 YouTube 音频缓存");
    } catch (error) {
      console.error("清除 YouTube 音频缓存失败:", error);
      message.error("清除 YouTube 音频缓存失败");
    } finally {
      setClearingState("youtubeAudio", false);
    }
  }, [message, refreshYoutubeAudioCache, setClearingState]);

  const handleClearBilibiliAudioCache = useCallback(async () => {
    setClearingState("bilibiliAudio", true);
    try {
      await clearBilibiliAudioCache();
      await refreshBilibiliAudioCache();
      message.success("已清空 Bilibili 音频缓存");
    } catch (error) {
      console.error("清除 Bilibili 音频缓存失败:", error);
      message.error("清除 Bilibili 音频缓存失败");
    } finally {
      setClearingState("bilibiliAudio", false);
    }
  }, [message, refreshBilibiliAudioCache, setClearingState]);

  const handleClearYoutubeCache = useCallback(async () => {
    setClearingState("youtube", true);
    try {
      await clearYoutubeCache();
      await refreshYoutubeCache();
      message.success("已清空 YouTube 视频缓存");
    } catch (error) {
      console.error("清除 YouTube 视频缓存失败:", error);
      message.error("清除 YouTube 视频缓存失败");
    } finally {
      setClearingState("youtube", false);
    }
  }, [message, refreshYoutubeCache, setClearingState]);

  const handleClearBilibiliCache = useCallback(async () => {
    setClearingState("bilibili", true);
    try {
      await clearBilibiliCache();
      await refreshBilibiliCache();
      message.success("已清空 Bilibili 视频缓存");
    } catch (error) {
      console.error("清除 Bilibili 视频缓存失败:", error);
      message.error("清除 Bilibili 视频缓存失败");
    } finally {
      setClearingState("bilibili", false);
    }
  }, [message, refreshBilibiliCache, setClearingState]);

  const handleClearNotionCache = useCallback(async () => {
    setClearingState("notion", true);
    try {
      await clearNotionCache();
      await refreshNotionCache();
      message.success("已清空 Notion 视频缓存");
    } catch (error) {
      console.error("清除 Notion 视频缓存失败:", error);
      message.error("清除 Notion 视频缓存失败");
    } finally {
      setClearingState("notion", false);
    }
  }, [message, refreshNotionCache, setClearingState]);

  const handleDeleteRemoteRow = useCallback(
    async (row: CacheRow<RemoteCacheItem>) => {
      const key = `remote:${row.id}`;
      setDeletingKey(key);
      try {
        const removed = await deleteRemoteVideoCacheEntry(row.id);
        if (removed) {
          message.success("已删除该远程视频缓存");
        } else {
          message.warning("缓存记录不存在，可能已被移除");
        }
        await refreshRemoteCache();
      } catch (error) {
        console.error("删除远程视频缓存失败:", error);
        message.error("删除远程视频缓存失败");
      } finally {
        setDeletingKey((prev) => (prev === key ? null : prev));
      }
    },
    [message, refreshRemoteCache],
  );

  const handleDeleteImageRow = useCallback(
    async (row: CacheRow<RemoteImageCacheItem>) => {
      const key = `image:${row.id}`;
      setDeletingKey(key);
      try {
        const removed = await deleteRemoteImageCacheEntry(row.id);
        if (removed) {
          message.success("已删除该图片缓存");
        } else {
          message.warning("缓存记录不存在，可能已被移除");
        }
        await refreshImageCache();
      } catch (error) {
        console.error("删除图片缓存失败:", error);
        message.error("删除图片缓存失败");
      } finally {
        setDeletingKey((prev) => (prev === key ? null : prev));
      }
    },
    [message, refreshImageCache],
  );

  const handleDeleteAudioRow = useCallback(
    async (row: CacheRow<RemoteAudioCacheItem>) => {
      const key = `audio:${row.id}`;
      setDeletingKey(key);
      try {
        const removed = await deleteRemoteAudioCacheEntry(row.id);
        if (removed) {
          message.success("已删除该音频缓存");
        } else {
          message.warning("缓存记录不存在，可能已被移除");
        }
        await refreshAudioCache();
      } catch (error) {
        console.error("删除音频缓存失败:", error);
        message.error("删除音频缓存失败");
      } finally {
        setDeletingKey((prev) => (prev === key ? null : prev));
      }
    },
    [message, refreshAudioCache],
  );

  const handleDeleteYoutubeAudioRow = useCallback(
    async (row: CacheRow<YoutubeAudioCacheItem>) => {
      const key = `youtubeAudio:${row.id}`;
      setDeletingKey(key);
      try {
        const removed = await deleteYoutubeAudioCache(row.payload.url);
        if (removed) {
          message.success("已删除该 YouTube 音频缓存");
        } else {
          message.warning("未找到该 YouTube 音频缓存记录");
        }
        await refreshYoutubeAudioCache();
      } catch (error) {
        console.error("删除 YouTube 音频缓存失败:", error);
        message.error("删除 YouTube 音频缓存失败");
      } finally {
        setDeletingKey((prev) => (prev === key ? null : prev));
      }
    },
    [message, refreshYoutubeAudioCache],
  );

  const handleDeleteBilibiliAudioRow = useCallback(
    async (row: CacheRow<BilibiliAudioCacheItem>) => {
      const key = `bilibiliAudio:${row.id}`;
      setDeletingKey(key);
      try {
        const removed = await deleteBilibiliAudioCache(
          row.payload.bvid,
          row.payload.cid,
        );
        if (removed) {
          message.success("已删除该 Bilibili 音频缓存");
        } else {
          message.warning("未找到该 Bilibili 音频缓存记录");
        }
        await refreshBilibiliAudioCache();
      } catch (error) {
        console.error("删除 Bilibili 音频缓存失败:", error);
        message.error("删除 Bilibili 音频缓存失败");
      } finally {
        setDeletingKey((prev) => (prev === key ? null : prev));
      }
    },
    [message, refreshBilibiliAudioCache],
  );

  const handleDeleteYoutubeRow = useCallback(
    async (row: CacheRow<YoutubeCacheWithPreview>) => {
      const key = `youtube:${row.id}`;
      setDeletingKey(key);
      try {
        const removed = await deleteYoutubeCache({
          url: row.payload.url,
          localPath: row.payload.localPath,
        });
        if (removed) {
          message.success("已删除该 YouTube 视频缓存");
        } else {
          message.warning("未找到该 YouTube 缓存记录");
        }
        await refreshYoutubeCache();
      } catch (error) {
        console.error("删除 YouTube 视频缓存失败:", error);
        message.error("删除 YouTube 视频缓存失败");
      } finally {
        setDeletingKey((prev) => (prev === key ? null : prev));
      }
    },
    [message, refreshYoutubeCache],
  );

  const handleDeleteBilibiliRow = useCallback(
    async (row: CacheRow<BilibiliCacheWithPreview>) => {
      const { bvid, cid, quality } = row.payload;
      const key = `bilibili:${bvid}-${cid}-${quality}`;
      setDeletingKey(key);
      try {
        const removed = await deleteBilibiliCache(bvid, cid, quality);
        if (removed) {
          message.success("已删除该 Bilibili 视频缓存");
        } else {
          message.warning("未找到该 Bilibili 缓存记录");
        }
        await refreshBilibiliCache();
      } catch (error) {
        console.error("删除 Bilibili 视频缓存失败:", error);
        message.error("删除 Bilibili 视频缓存失败");
      } finally {
        setDeletingKey((prev) => (prev === key ? null : prev));
      }
    },
    [message, refreshBilibiliCache],
  );

  const handleDeleteNotionRow = useCallback(
    async (row: CacheRow<NotionCacheWithPreview>) => {
      const key = `notion:${row.id}`;
      setDeletingKey(key);
      try {
        const removed = await deleteNotionCache(row.payload.blockId);
        if (removed) {
          message.success("已删除该 Notion 视频缓存");
        } else {
          message.warning("未找到该 Notion 缓存记录");
        }
        await refreshNotionCache();
      } catch (error) {
        console.error("删除 Notion 视频缓存失败:", error);
        message.error("删除 Notion 视频缓存失败");
      } finally {
        setDeletingKey((prev) => (prev === key ? null : prev));
      }
    },
    [message, refreshNotionCache],
  );

  const remoteRows = useMemo<CacheRow<RemoteCacheItem>[]>(() => {
    return remoteCache.map((item) => ({
      id: item.id,
      name: item.title || item.fileName,
      subtitle: item.url,
      sizeLabel: formatBytes(item.fileSize),
      payload: item,
    }));
  }, [remoteCache]);

  const imageRows = useMemo<CacheRow<RemoteImageCacheItem>[]>(() => {
    return imageCache.map((item) => ({
      id: item.id,
      name: item.title || item.fileName,
      subtitle: item.url,
      sizeLabel: formatBytes(item.fileSize),
      payload: item,
    }));
  }, [imageCache]);

  const audioRows = useMemo<CacheRow<RemoteAudioCacheItem>[]>(() => {
    return audioCache.map((item) => ({
      id: item.id,
      name: item.fileName,
      subtitle: item.url,
      sizeLabel: formatBytes(item.fileSize),
      payload: item,
    }));
  }, [audioCache]);

  const youtubeAudioRows = useMemo<CacheRow<YoutubeAudioCacheItem>[]>(() => {
    return youtubeAudioCache.map((item) => ({
      id: item.url,
      name: item.title || item.url,
      subtitle: item.url,
      sizeLabel: formatBytes(item.fileSize),
      payload: item,
    }));
  }, [youtubeAudioCache]);

  const bilibiliAudioRows = useMemo<CacheRow<BilibiliAudioCacheItem>[]>(() => {
    return bilibiliAudioCache.map((item) => ({
      id: `${item.bvid}-${item.cid}`,
      name: item.title || `Bilibili ${item.bvid}`,
      subtitle: `BVID: ${item.bvid} · CID: ${item.cid}`,
      sizeLabel: formatBytes(item.fileSize),
      payload: item,
    }));
  }, [bilibiliAudioCache]);

  const youtubeRows = useMemo<CacheRow<YoutubeCacheWithPreview>[]>(() => {
    return youtubeCache.map((item) => ({
      id: item.url,
      name: item.title || item.url,
      subtitle: item.url,
      sizeLabel: formatBytes(item.fileSize),
      payload: item,
    }));
  }, [youtubeCache]);

  const bilibiliRows = useMemo<CacheRow<BilibiliCacheWithPreview>[]>(() => {
    return bilibiliCache.map((item) => ({
      id: `${item.bvid}-${item.cid}-${item.quality}`,
      name: item.title || `Bilibili ${item.bvid}`,
      subtitle: `BVID: ${item.bvid} · CID: ${item.cid} · 清晰度: ${item.quality}`,
      sizeLabel: formatBytes(item.fileSize),
      payload: item,
    }));
  }, [bilibiliCache]);

  const notionRows = useMemo<CacheRow<NotionCacheWithPreview>[]>(() => {
    return notionCache.map((item) => ({
      id: item.blockId,
      name: item.title || item.blockId,
      subtitle: item.blockId,
      sizeLabel: formatBytes(item.fileSize),
      payload: item,
    }));
  }, [notionCache]);

  useEffect(() => {
    setSelectedRows((prev) => {
      const configs: Array<[CacheSectionKey, CacheRow[]]> = [
        ["remote", remoteRows],
        ["image", imageRows],
        ["audio", audioRows],
        ["youtubeAudio", youtubeAudioRows],
        ["bilibiliAudio", bilibiliAudioRows],
        ["youtube", youtubeRows],
        ["bilibili", bilibiliRows],
        ["notion", notionRows],
      ];
      let changed = false;
      const next = { ...prev };
      configs.forEach(([key, rows]) => {
        const validIds = new Set(rows.map((row) => row.id));
        const filtered = new Set(
          Array.from(prev[key]).filter((id) => validIds.has(id)),
        );
        if (filtered.size !== prev[key].size) {
          next[key] = filtered;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [
    remoteRows,
    imageRows,
    audioRows,
    youtubeAudioRows,
    bilibiliAudioRows,
    youtubeRows,
    bilibiliRows,
    notionRows,
  ]);

  const handleBatchDelete = useCallback(
    async (
      key: CacheSectionKey,
      rows: CacheRow[],
      onDelete: (row: CacheRow) => Promise<void>,
    ) => {
      const targets = rows.filter((row) => selectedRows[key].has(row.id));
      if (targets.length === 0) {
        return;
      }
      setBatchDeletingState(key, true);
      try {
        for (const row of targets) {
          await onDelete(row);
        }
        clearSelection(key);
      } finally {
        setBatchDeletingState(key, false);
      }
    },
    [clearSelection, selectedRows, setBatchDeletingState],
  );
  const openPreviewModal = useCallback(
    (title: string, videoSrc?: string | null) => {
      if (!videoSrc) {
        message.warning("该视频暂无可用预览");
        return;
      }
      setPreviewModal({
        open: true,
        title,
        src: videoSrc,
      });
    },
    [message],
  );

  const closePreviewModal = useCallback(() => {
    if (previewVideoRef.current) {
      previewVideoRef.current.pause();
      try {
        previewVideoRef.current.currentTime = 0;
      } catch {
        // ignore reset failure
      }
    }
    setPreviewModal((prev) => ({ ...prev, open: false }));
  }, []);

  const openImagePreview = useCallback(
    (title: string, src?: string | null) => {
      if (!src) {
        message.warning("该图片暂无可用预览");
        return;
      }
      setImagePreview({ open: true, src, title });
    },
    [message],
  );

  const closeImagePreview = useCallback(() => {
    setImagePreview((prev) => ({ ...prev, open: false }));
  }, []);

  const openAudioPreview = useCallback(
    (title: string, src?: string | null) => {
      if (!src) {
        message.warning("该音频暂无可用预览");
        return;
      }
      setAudioPreview({
        open: true,
        src,
        title,
      });
    },
    [message],
  );

  const closeAudioPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      try {
        previewAudioRef.current.currentTime = 0;
      } catch {
        // ignore reset failure
      }
    }
    setAudioPreview((prev) => ({ ...prev, open: false }));
  }, []);

  const renderCacheSection = <TPayload,>(
    key: CacheSectionKey,
    title: string,
    description: string,
    rows: CacheRow<TPayload>[],
    onDelete: (row: CacheRow<TPayload>) => Promise<void>,
    onClear: () => Promise<void> | void,
    options?: {
      renderRows?: (
        rows: CacheRow<TPayload>[],
        helpers: {
          isSelected: (rowId: string) => boolean;
          toggleRow: (rowId: string) => void;
          isDeleting: (row: CacheRow<TPayload>) => boolean;
          onDeleteRow: (row: CacheRow<TPayload>) => void;
        },
      ) => ReactNode;
      emptyHint?: string;
    },
  ) => {
    const expanded = expandedSections[key];
    const selectedSet = selectedRows[key];
    const allSelected = rows.length > 0 && selectedSet.size === rows.length;

    const toggleAll = () => {
      updateSelection(key, (set) => {
        if (rows.length === 0) {
          set.clear();
          return;
        }
        if (set.size === rows.length) {
          set.clear();
        } else {
          set.clear();
          rows.forEach((row) => set.add(row.id));
        }
      });
    };

    const toggleRow = (rowId: string) => {
      updateSelection(key, (set) => {
        if (set.has(rowId)) {
          set.delete(rowId);
        } else {
          set.add(rowId);
        }
      });
    };

    const isRowSelected = (rowId: string) => selectedSet.has(rowId);
    const isRowDeleting = (row: CacheRow<TPayload>) =>
      deletingKey === `${key}:${row.id}`;

    const defaultRenderRows = () => (
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-3 rounded-xl bg-gray-50 dark:bg-zinc-900/40 px-3 py-2"
          >
            <CustomCheckbox
              checked={isRowSelected(row.id)}
              onChange={() => toggleRow(row.id)}
            />
            <div className="flex-1 min-w-0 pr-3">
              <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                {row.name}
              </div>
              {row.subtitle && (
                <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                  {row.subtitle}
                </div>
              )}
              {row.sizeLabel && (
                <div className="mt-0.5 text-xs text-gray-400">
                  大小：{row.sizeLabel}
                </div>
              )}
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-red-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                void onDelete(row);
              }}
              disabled={isRowDeleting(row)}
            >
              {isRowDeleting(row) ? "清除中..." : "清除"}
            </button>
          </div>
        ))}
      </div>
    );

    const body =
      options?.renderRows?.(rows, {
        isSelected: isRowSelected,
        toggleRow,
        isDeleting: isRowDeleting,
        onDeleteRow: (row) => {
          void onDelete(row);
        },
      }) ?? defaultRenderRows();

    return (
      <div
        key={key}
        className="mb-6 rounded-2xl border border-gray-100 dark:border-slate-800 p-4"
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <button
            type="button"
            className="flex-1 text-left"
            onClick={() => toggleSection(key)}
          >
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {title}
              </div>
              <span className="text-xs text-gray-400">
                {expanded ? "（点击收起）" : "（点击查看详情）"}
              </span>
            </div>
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {description}
            </div>
          </button>
          <SettingButton
            type="button"
            variant="secondary"
            onClick={() => {
              void onClear();
            }}
            loading={clearing[key]}
            disabled={clearing[key] || rows.length === 0}
          >
            清除全部
          </SettingButton>
        </div>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key={`${key}-content`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden mt-3"
            >
              {rows.length === 0 ? (
                <div className="rounded-xl bg-gray-50 dark:bg-zinc-900/40 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                  {options?.emptyHint ?? "暂无缓存"}
                </div>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <CustomCheckbox
                        checked={allSelected}
                        onChange={toggleAll}
                      />
                      <span className="text-xs text-gray-600 dark:text-gray-300">
                        全选
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      已选 {selectedSet.size} 项
                    </div>
                    <SettingButton
                      type="button"
                      variant="danger"
                      className="ml-auto"
                      disabled={selectedSet.size === 0 || batchDeleting[key]}
                      loading={batchDeleting[key]}
                      onClick={() => {
                        void handleBatchDelete(
                          key,
                          rows,
                          onDelete as (row: CacheRow) => Promise<void>,
                        );
                      }}
                    >
                      批量删除
                    </SettingButton>
                  </div>
                  <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                    {body}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderVideoRowsFactory = <
    TPayload extends { previewUrl?: string | null },
  >(
    getInfoLines?: (row: CacheRow<TPayload>) => ReactNode[],
    previewOptions?: {
      label?: string;
      onPreview?: (row: CacheRow<TPayload>, src?: string | null) => void;
    },
  ) => {
    return (
      rows: CacheRow<TPayload>[],
      helpers: {
        isSelected: (rowId: string) => boolean;
        toggleRow: (rowId: string) => void;
        isDeleting: (row: CacheRow<TPayload>) => boolean;
        onDeleteRow: (row: CacheRow<TPayload>) => void;
      },
    ) => (
      <div className="space-y-3">
        {rows.map((row) => {
          const payload = row.payload as TPayload & {
            previewUrl?: string | null;
          };
          const isDeleting = helpers.isDeleting(row);
          const canPreview = !!payload.previewUrl;
          const infoLines = getInfoLines ? getInfoLines(row) : [];
          const handlePreview =
            previewOptions?.onPreview ||
            ((currentRow: CacheRow<TPayload>, src?: string | null) =>
              openPreviewModal(currentRow.name, src));
          return (
            <div
              key={row.id}
              className="flex flex-col gap-2 rounded-xl bg-gray-50 dark:bg-zinc-900/40 px-3 py-3 sm:flex-row sm:items-center"
            >
              <div className="flex flex-1 items-start gap-3 min-w-0">
                <CustomCheckbox
                  checked={helpers.isSelected(row.id)}
                  onChange={() => helpers.toggleRow(row.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                    {row.name}
                  </div>
                  {row.subtitle && (
                    <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                      {row.subtitle}
                    </div>
                  )}
                  {row.sizeLabel && (
                    <div className="text-[11px] text-gray-400">
                      {row.sizeLabel}
                    </div>
                  )}
                  {infoLines.map((line, idx) => (
                    <div
                      key={idx}
                      className="text-[11px] text-gray-500 dark:text-gray-400 break-all"
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <SettingButton
                  type="button"
                  variant="secondary"
                  className="px-3 py-1 text-xs"
                  disabled={!canPreview}
                  onClick={() => handlePreview(row, payload.previewUrl)}
                >
                  {previewOptions?.label ?? "预览"}
                </SettingButton>
                <SettingButton
                  type="button"
                  variant="danger"
                  className="px-3 py-1 text-xs"
                  disabled={isDeleting}
                  onClick={() => {
                    void helpers.onDeleteRow(row);
                  }}
                >
                  {isDeleting ? "清除中..." : "清除"}
                </SettingButton>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderRemoteRows = renderVideoRowsFactory<RemoteCacheItem>((row) => [
    `缓存路径：${row.payload.localPath}`,
  ]);

  const renderYoutubeRows = renderVideoRowsFactory<YoutubeCacheWithPreview>(
    (row) => [`缓存路径：${row.payload.localPath}`],
  );

  const renderBilibiliRows = renderVideoRowsFactory<BilibiliCacheWithPreview>(
    (row) => [`缓存路径：${row.payload.localPath}`],
  );

  const renderNotionRows = renderVideoRowsFactory<NotionCacheWithPreview>(
    (row) => [`缓存路径：${row.payload.localPath}`],
  );

  const renderImageRows = renderVideoRowsFactory<RemoteImageCacheItem>(
    (row) => [`缓存路径：${row.payload.localPath}`],
    {
      label: "预览图片",
      onPreview: (row, src) => openImagePreview(row.name, src),
    },
  );

  const renderAudioRows = renderVideoRowsFactory<RemoteAudioCacheItem>(
    (row) => [`缓存路径：${row.payload.localPath}`],
    {
      label: "试听音频",
      onPreview: (row, src) => openAudioPreview(row.name, src),
    },
  );

  const renderYoutubeAudioRows = renderVideoRowsFactory<YoutubeAudioCacheItem>(
    (row) => [`缓存路径：${row.payload.localPath}`],
    {
      label: "试听音频",
      onPreview: (row, src) => openAudioPreview(row.name, src),
    },
  );

  const renderBilibiliAudioRows =
    renderVideoRowsFactory<BilibiliAudioCacheItem>(
      (row) => [`缓存路径：${row.payload.localPath}`],
      {
        label: "试听音频",
        onPreview: (row, src) => openAudioPreview(row.name, src),
      },
    );

  return (
    <>
      <SettingContainer>
        <SettingSection
          title="网页解析"
          description="配置网页剪藏文档的默认行为"
        >
          <SettingSwitch
            label="解析文档时翻译为中文"
            description="开启后，解析网页时将尝试自动翻译内容为中文"
            checked={translateToChinese}
            onChange={setWebClipTranslateToChinese}
          />
        </SettingSection>

        <SettingSection title="视频设置" description="调整远程视频缓存行为">
          <SettingSwitch
            label="自动缓存远程视频"
            description="开启后，普通网络视频会通过 LocalVideo 自动缓存到本地以减少重复下载"
            checked={autoCacheRemoteVideo}
            onChange={setAutoCacheRemoteVideo}
          />
        </SettingSection>

        <SettingSection
          title="视频缓存管理"
          description="清理缓存可以释放磁盘空间，删除后对应视频会在下次播放时重新下载"
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              以下列表展示各平台已缓存的视频文件，仅影响缓存数据，不会删除原始内容。
            </div>
          </div>
          {renderCacheSection(
            "remote",
            "远程视频缓存",
            "通过 LocalVideo 播放的普通网络视频缓存",
            remoteRows,
            handleDeleteRemoteRow,
            handleClearRemoteCache,
            {
              renderRows: renderRemoteRows,
            },
          )}
          {renderCacheSection(
            "youtube",
            "YouTube 视频缓存",
            "YouTube 解析下载的本地缓存文件",
            youtubeRows,
            handleDeleteYoutubeRow,
            handleClearYoutubeCache,
            {
              renderRows: renderYoutubeRows,
            },
          )}
          {renderCacheSection(
            "bilibili",
            "Bilibili 视频缓存",
            "Bilibili 下载器生成的缓存文件",
            bilibiliRows,
            handleDeleteBilibiliRow,
            handleClearBilibiliCache,
            {
              renderRows: renderBilibiliRows,
            },
          )}
          {renderCacheSection(
            "notion",
            "Notion 视频缓存",
            "缓存的 Notion 视频块文件",
            notionRows,
            handleDeleteNotionRow,
            handleClearNotionCache,
            {
              renderRows: renderNotionRows,
            },
          )}
        </SettingSection>

        <SettingSection
          title="音频设置"
          description="控制 LocalAudio 组件和播客播放器的远程音频缓存策略"
        >
          <SettingSwitch
            label="自动缓存远程音频"
            description="关闭后，播放远程音频时将直接使用在线链接，不会写入本地缓存"
            checked={autoCacheRemoteAudio}
            onChange={setAutoCacheRemoteAudio}
          />
        </SettingSection>

        <SettingSection
          title="音频缓存管理"
          description="缓存的音频可以离线播放，但会占用磁盘空间，定期清理可释放空间"
        >
          <div className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            列表展示通过 LocalAudio
            与播客播放器下载的音频缓存，支持试听和批量删除。
          </div>
          {renderCacheSection(
            "audio",
            "远程音频缓存",
            "通过 LocalAudio 播放的普通网络音频缓存",
            audioRows,
            handleDeleteAudioRow,
            handleClearAudioCache,
            {
              renderRows: renderAudioRows,
              emptyHint: "暂无音频缓存",
            },
          )}
          {renderCacheSection(
            "youtubeAudio",
            "YouTube 音频缓存",
            "YouTube 音频解析下载的本地缓存文件",
            youtubeAudioRows,
            handleDeleteYoutubeAudioRow,
            handleClearYoutubeAudioCache,
            {
              renderRows: renderYoutubeAudioRows,
              emptyHint: "暂无 YouTube 音频缓存",
            },
          )}
          {renderCacheSection(
            "bilibiliAudio",
            "Bilibili 音频缓存",
            "Bilibili 音频解析下载的本地缓存文件",
            bilibiliAudioRows,
            handleDeleteBilibiliAudioRow,
            handleClearBilibiliAudioCache,
            {
              renderRows: renderBilibiliAudioRows,
              emptyHint: "暂无 Bilibili 音频缓存",
            },
          )}
        </SettingSection>

        <SettingSection title="图片设置" description="调整远程图片的缓存策略">
          <SettingSwitch
            label="自动缓存远程图片"
            description="关闭后，加载远程图片将直接使用在线链接，不写入本地缓存"
            checked={autoCacheRemoteImage}
            onChange={setAutoCacheRemoteImage}
          />
        </SettingSection>

        <SettingSection
          title="图片缓存管理"
          description="管理 LocalImage 生成的图片缓存，可预览并删除指定文件"
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              列表展示远程图片缓存，点击预览可在透明背景中查看原图。
            </div>
          </div>
          {renderCacheSection(
            "image",
            "远程图片缓存",
            "通过 LocalImage 自动保存的图片文件",
            imageRows,
            handleDeleteImageRow,
            handleClearImageCache,
            {
              renderRows: renderImageRows,
            },
          )}
        </SettingSection>
      </SettingContainer>
      <CustomModal
        open={previewModal.open}
        onCancel={closePreviewModal}
        footer={null}
        title={previewModal.title || "视频预览"}
        width={720}
      >
        {previewModal.src ? (
          <video
            ref={previewVideoRef}
            src={previewModal.src}
            controls
            className="h-full w-full"
            style={{ maxHeight: "70vh" }}
          />
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            暂无可用预览
          </div>
        )}
      </CustomModal>
      <CustomModal
        open={audioPreview.open}
        onCancel={closeAudioPreview}
        footer={null}
        title={audioPreview.title || "音频预览"}
        width={480}
      >
        {audioPreview.src ? (
          <audio
            ref={previewAudioRef}
            src={audioPreview.src}
            controls
            className="w-full"
          />
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            暂无可用预览
          </div>
        )}
      </CustomModal>
      {typeof document !== "undefined" && imagePreview.open
        ? createPortal(
            <div
              className="fixed inset-0 z-11000 flex items-center justify-center bg-black/70 backdrop-blur-sm"
              onClick={closeImagePreview}
            >
              <div
                className="max-h-[90vh] max-w-[90vw] p-4"
                onClick={(e) => e.stopPropagation()}
              >
                {imagePreview.src ? (
                  <img
                    src={imagePreview.src}
                    alt={imagePreview.title}
                    className="max-h-[80vh] max-w-[80vw] rounded-lg object-contain shadow-lg"
                  />
                ) : (
                  <div className="rounded-lg bg-white/90 px-6 py-3 text-sm text-gray-600">
                    暂无可用预览
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
};

export default MiscSetting;
