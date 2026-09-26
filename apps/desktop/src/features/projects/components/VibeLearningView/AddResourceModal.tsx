import { memo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileText,
  Globe,
  Plus,
  Loader2,
  Check,
  AlertCircle,
  Upload as UploadIcon,
  Video,
  StickyNote,
} from "lucide-react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";

import CustomModal from "@/components/CustomModal";
import LocalImage from "@/components/LocalImage";
import { createVLResource, addVLIndexTask, ensureVLNoteResource } from "@/commands/vibe-learning";
import { uploadResource } from "@/hooks/useUploadResource";
import { nodeFetch } from "@/commands/extra";
import { createSmartExtractProvider } from "@/utils/web-clipper/providers";
import { collectClipStream } from "@/utils/web-clipper/stream";
import { Webview } from "@tau/shared";
import type { WebviewRef } from "@tau/shared";
import {
  isBilibiliUrl,
  getVideoInfoByUrl,
  getQualityInfo,
  getQualityOptions,
} from "@/utils/bilibili";
import { isYoutubeUrl } from "@/utils/youtube/parser";
import { getYoutubeVideoInfo } from "@/commands/youtube-cache";
import { getMarkdown } from "@/utils";
import useSettingStore from "@/stores/useSettingStore";
import type { VLResourceType, BilibiliSourceMeta, YoutubeSourceMeta } from "@/types/vibe-learning";
import type { StreamOption } from "@/types/youtube";
import type { SearchResult } from "@/types/search";
import NoteSelector from "./AppSidebar/components/NoteSelector";
import useEditorExtensions from "@/hooks/useDynamicExtensions";
import { toast } from "@tau/ui";

const ACCEPTED_UPLOAD_TYPES =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.html,.mp3,.wav,.m4a,.ogg,.flac,.aac,.mp4,.webm,.mov,.avi,.mkv,.jpg,.jpeg,.png,.gif,.webp,.bmp";

interface AddResourceModalProps {
  open: boolean;
  projectId: number;
  mainDbName: string;
  onClose: () => void;
  onSuccess: () => void;
}

type TabType = "file" | "url" | "video" | "note";
type ProcessingStep = "idle" | "fetching" | "extracting" | "saving" | "done";
type VideoStep = "input" | "config" | "adding" | "done";
type NoteStep = "search" | "processing" | "done";

type VideoProvider = "bilibili" | "youtube";

interface BilibiliVideoInfo {
  provider: "bilibili";
  bvid: string;
  cid: string;
  title: string;
  cover: string;
  qualityOptions: Array<{
    label: string;
    value: number;
    needLogin?: boolean;
    needVip?: boolean;
  }>;
}

interface YoutubeVideoInfoState {
  provider: "youtube";
  url: string;
  title: string;
  cover?: string;
  videoStreams: StreamOption[];
  audioStreams: StreamOption[];
}

type VideoInfo = BilibiliVideoInfo | YoutubeVideoInfoState;

const getYoutubeResolutionValue = (resolution?: string): number => {
  const match = resolution?.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
};

const sortYoutubeVideoStreams = (streams: StreamOption[]): StreamOption[] => {
  return [...streams].sort((a, b) => {
    const resolutionDiff =
      getYoutubeResolutionValue(b.resolution) - getYoutubeResolutionValue(a.resolution);
    if (resolutionDiff !== 0) return resolutionDiff;
    const fpsDiff = (b.fps || 0) - (a.fps || 0);
    if (fpsDiff !== 0) return fpsDiff;
    return (b.bitrate || 0) - (a.bitrate || 0);
  });
};

const sortYoutubeAudioStreams = (streams: StreamOption[]): StreamOption[] => {
  return [...streams].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
};

// 根据文件扩展名获取资源类型
const getResourceType = (fileName: string): VLResourceType => {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  const typeMap: Record<string, VLResourceType> = {
    pdf: "pdf",
    mp3: "audio",
    wav: "audio",
    m4a: "audio",
    ogg: "audio",
    flac: "audio",
    aac: "audio",
    wma: "audio",
    mp4: "video",
    webm: "video",
    mov: "video",
    avi: "video",
    mkv: "video",
    wmv: "video",
    flv: "video",
    jpg: "image",
    jpeg: "image",
    png: "image",
    gif: "image",
    webp: "image",
    bmp: "image",
    doc: "doc",
    docx: "docx",
    ppt: "ppt",
    pptx: "pptx",
    xls: "xls",
    xlsx: "xlsx",
    txt: "txt",
    md: "md",
    html: "html",
  };

  return typeMap[ext] || "other";
};

// 从 URL 提取域名作为资源名称
const extractNameFromUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    // 移除 www. 前缀
    const hostname = urlObj.hostname.replace(/^www\./, "");
    // 获取路径的最后一部分作为标题的一部分
    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      // 解码 URL 编码的字符
      const decoded = decodeURIComponent(lastPart);
      // 移除文件扩展名
      const withoutExt = decoded.replace(/\.[^.]+$/, "");
      if (withoutExt && withoutExt.length > 0 && withoutExt.length < 100) {
        return `${withoutExt} - ${hostname}`;
      }
    }
    return hostname;
  } catch {
    return url.slice(0, 50);
  }
};

// 验证 URL 格式
const isValidUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "http:" || urlObj.protocol === "https:";
  } catch {
    return false;
  }
};

// 从 HTML 中提取 title 标签内容
const extractTitleFromHtml = (html: string): string | null => {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    // 清理标题：去除多余空白、HTML 实体等
    return titleMatch[1]
      .trim()
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ");
  }
  return null;
};

const AddResourceModal = memo((props: AddResourceModalProps) => {
  const { open, projectId, mainDbName, onClose, onSuccess } = props;
  const { setting } = useSettingStore.getState();

  // Tab 状态
  const [activeTab, setActiveTab] = useState<TabType>("file");

  // 文件上传状态
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  // 网址剪藏状态
  const [url, setUrl] = useState("");
  const [resourceTitle, setResourceTitle] = useState("");
  const [processingStep, setProcessingStep] = useState<ProcessingStep>("idle");
  const [error, setError] = useState<string | null>(null);

  // 视频相关状态
  const [videoUrl, setVideoUrl] = useState("");
  const [videoStep, setVideoStep] = useState<VideoStep>("input");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<number>(80);
  const [selectedVideoStream, setSelectedVideoStream] = useState<string>("");
  const [selectedAudioStream, setSelectedAudioStream] = useState<string>("");
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // 笔记相关状态
  const [noteStep, setNoteStep] = useState<NoteStep>("search");
  const [noteError, setNoteError] = useState<string | null>(null);

  // Webview 相关状态（用于加载 SPA 等动态网页）
  const webviewRef = useRef<WebviewRef>(null);
  const [webviewUrl, setWebviewUrl] = useState<string | null>(null);
  const webviewLoadResolve = useRef<((html: string) => void) | null>(null);
  const webviewLoadReject = useRef<((error: Error) => void) | null>(null);

  const extensions = useEditorExtensions();

  // 重置状态
  const resetState = useMemoizedFn(() => {
    setActiveTab("file");
    setUploading(false);
    setUploadedFiles([]);
    setUrl("");
    setResourceTitle("");
    setProcessingStep("idle");
    setError(null);
    // 重置视频状态
    setVideoUrl("");
    setVideoStep("input");
    setVideoInfo(null);
    setSelectedQuality(80);
    setSelectedVideoStream("");
    setSelectedAudioStream("");
    setVideoError(null);
    setIsAnalyzing(false);
    // 重置笔记状态
    setNoteStep("search");
    setNoteError(null);
    // 重置 Webview 状态
    setWebviewUrl(null);
    webviewLoadResolve.current = null;
    webviewLoadReject.current = null;
  });

  // 打开弹窗时重置状态
  useEffect(() => {
    if (open) {
      resetState();
    }
  }, [open, resetState]);

  // 使用 Webview 加载网页（用于 SPA 等动态渲染页面）
  const loadWithWebview = useMemoizedFn((targetUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        setWebviewUrl(null);
        webviewLoadResolve.current = null;
        webviewLoadReject.current = null;
        reject(new Error("网页加载超时"));
      }, 30000); // 30 秒超时

      webviewLoadResolve.current = (html: string) => {
        clearTimeout(timeout);
        setWebviewUrl(null);
        webviewLoadResolve.current = null;
        webviewLoadReject.current = null;
        resolve(html);
      };

      webviewLoadReject.current = (error: Error) => {
        clearTimeout(timeout);
        setWebviewUrl(null);
        webviewLoadResolve.current = null;
        webviewLoadReject.current = null;
        reject(error);
      };

      setWebviewUrl(targetUrl);
    });
  });

  // Webview 加载完成回调
  const handleWebviewLoad = useMemoizedFn(async () => {
    // 等待额外时间让动态内容（JavaScript）加载完成
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      const html = await webviewRef.current?.getHTML();
      if (html && webviewLoadResolve.current) {
        webviewLoadResolve.current(html);
      } else if (webviewLoadReject.current) {
        webviewLoadReject.current(new Error("无法获取网页内容"));
      }
    } catch (err) {
      if (webviewLoadReject.current) {
        webviewLoadReject.current(err instanceof Error ? err : new Error("获取网页内容失败"));
      }
    }
  });

  // Webview 加载错误回调
  const handleWebviewError = useMemoizedFn((error: Error) => {
    if (webviewLoadReject.current) {
      webviewLoadReject.current(error);
    }
  });

  // 文件上传处理
  const handleUpload = useMemoizedFn(async (file: File) => {
    setUploading(true);
    try {
      // 1. 上传到云存储
      const uploadedUrl = await uploadResource(file);
      if (!uploadedUrl) {
        throw new Error("上传失败");
      }

      // 2. 创建资源记录
      const resource = await createVLResource({
        projectId,
        name: file.name,
        originalPath: uploadedUrl,
        resourceType: getResourceType(file.name),
        fileSize: file.size,
        sourceType: "local",
      });

      // 3. 添加索引任务
      await addVLIndexTask({
        resourceId: resource.id,
        projectId,
        mainDbName,
        originalPath: uploadedUrl,
        resourceName: file.name,
        type: "full",
      });

      setUploadedFiles(prev => [...prev, file.name]);
      toast.success(`上传成功: ${file.name}`);
      onSuccess();
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error(`上传失败: ${file.name}`);
    } finally {
      setUploading(false);
    }

    return false; // 阻止默认上传行为
  });

  // 网址剪藏处理
  const handleClipUrl = useMemoizedFn(async () => {
    if (!url.trim()) {
      toast.warning("请输入网址");
      return;
    }

    if (!isValidUrl(url.trim())) {
      toast.error("请输入有效的网址（以 http:// 或 https:// 开头）");
      return;
    }

    setError(null);
    setProcessingStep("fetching");

    try {
      let html: string | null = null;
      let pageTitle: string | null = null;

      // 1. 先尝试使用 nodeFetch 快速获取网页内容
      try {
        const response = await nodeFetch(url.trim(), {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          },
        });

        // nodeFetch 默认返回 res.data，对于 HTML 请求就是字符串
        const fetchedHtml = typeof response === "string" ? response : String(response);
        if (fetchedHtml && fetchedHtml.trim().length > 0) {
          html = fetchedHtml;
          pageTitle = extractTitleFromHtml(html);
        }
      } catch (fetchErr) {
        console.log("nodeFetch failed, will try webview:", fetchErr);
      }

      // 2. 如果 fetch 失败或内容过少（可能是 SPA），使用 Webview 加载
      // 内容少于 500 字符通常意味着是一个 SPA 壳页面
      if (!html || html.trim().length < 500) {
        console.log("Using webview to load dynamic content...");
        try {
          html = await loadWithWebview(url.trim());
          // 从 Webview 获取标题
          pageTitle = webviewRef.current?.getTitle() || null;
        } catch (webviewErr) {
          // 如果 Webview 也失败了，且之前 fetch 有内容，就用 fetch 的内容
          if (!html) {
            throw webviewErr;
          }
          console.log("Webview load failed, using fetch result:", webviewErr);
        }
      }

      if (!html || html.trim().length === 0) {
        throw new Error("网页内容为空");
      }

      // 确定资源标题：优先使用用户输入，否则从网页提取，最后使用 URL
      let finalTitle = resourceTitle.trim();
      if (!finalTitle) {
        finalTitle = pageTitle || extractTitleFromHtml(html) || extractNameFromUrl(url.trim());
      }

      setProcessingStep("extracting");

      // 3. 提取 Markdown 内容
      const provider = createSmartExtractProvider();
      const markdown = await collectClipStream(
        provider.clip({
          html,
          url: url.trim(),
          title: finalTitle,
          options: {
            smartExtractClean: true,
          },
        })
      );

      if (!markdown || markdown.trim().length === 0) {
        throw new Error("无法提取网页内容");
      }

      setProcessingStep("saving");

      // 4. 创建资源（使用 Markdown 内容）
      const resourceName = finalTitle + ".md";

      // 将 Markdown 内容转为 Blob 并上传
      const blob = new Blob([markdown], { type: "text/markdown" });
      const file = new File([blob], resourceName, { type: "text/markdown" });

      const uploadedUrl = await uploadResource(file);
      if (!uploadedUrl) {
        throw new Error("保存失败");
      }

      // 5. 创建资源记录
      const resource = await createVLResource({
        projectId,
        name: resourceName,
        originalPath: uploadedUrl,
        resourceType: "md",
        fileSize: blob.size,
        sourceType: "remote",
        sourceMetaInfo: JSON.stringify({ url: url.trim(), title: finalTitle }),
      });

      // 6. 添加索引任务
      await addVLIndexTask({
        resourceId: resource.id,
        projectId,
        mainDbName,
        originalPath: uploadedUrl,
        resourceName: resourceName,
        type: "full",
      });

      setProcessingStep("done");
      toast.success("网页剪藏成功");
      onSuccess();

      // 延迟关闭弹窗
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error("Clip URL failed:", err);
      const errorMessage = err instanceof Error ? err.message : "剪藏失败，请稍后重试";
      setError(errorMessage);
      setProcessingStep("idle");
    }
  });

  const detectVideoProvider = useMemoizedFn((url: string): VideoProvider | "unsupported" => {
    if (isBilibiliUrl(url)) return "bilibili";
    if (isYoutubeUrl(url)) return "youtube";
    return "unsupported";
  });

  const handleAnalyzeBilibili = useMemoizedFn(async (targetUrl: string) => {
    const credentials = setting.integration.bilibili.credentials;
    const info = await getVideoInfoByUrl(targetUrl, credentials);

    if (!info) {
      setVideoError("无法获取视频信息，请检查链接是否正确");
      return;
    }

    const qualityInfo = await getQualityInfo(info.cid, info.bvid, credentials);
    const options = getQualityOptions(qualityInfo.accept_quality);

    if (options.length === 0) {
      setVideoError("未找到可用的清晰度选项");
      return;
    }

    const hasLogin = !!credentials.SESSDATA;
    const hasVip = !!setting.integration.bilibili.userInfo.vipStatus && hasLogin;
    let defaultQuality: number;
    if (hasVip) {
      defaultQuality = options[0]?.value || 80;
    } else if (hasLogin) {
      const maxQuality = Math.max(...options.filter(opt => opt.value <= 80).map(opt => opt.value));
      defaultQuality = maxQuality || 64;
    } else {
      const maxQuality = Math.max(...options.filter(opt => opt.value <= 64).map(opt => opt.value));
      defaultQuality = maxQuality || 32;
    }

    setVideoInfo({
      provider: "bilibili",
      bvid: info.bvid,
      cid: info.cid,
      title: info.title,
      cover: info.cover,
      qualityOptions: options,
    });
    setSelectedQuality(defaultQuality);
    setSelectedVideoStream("");
    setSelectedAudioStream("");
    setVideoStep("config");
  });

  const handleAnalyzeYoutube = useMemoizedFn(async (targetUrl: string) => {
    const info = await getYoutubeVideoInfo(targetUrl, setting.integration.youtube.proxy);
    if (!info) {
      setVideoError("无法获取视频信息，请检查链接是否正确");
      return;
    }

    const sortedVideoStreams = sortYoutubeVideoStreams(info.videoStreams);
    const sortedAudioStreams = sortYoutubeAudioStreams(info.audioStreams);

    if (sortedVideoStreams.length === 0) {
      setVideoError("未找到可用的视频流");
      return;
    }
    if (sortedAudioStreams.length === 0) {
      setVideoError("未找到可用的音频流");
      return;
    }

    setVideoInfo({
      provider: "youtube",
      url: info.url || targetUrl,
      title: info.title,
      cover: info.thumbnail,
      videoStreams: sortedVideoStreams,
      audioStreams: sortedAudioStreams,
    });
    setSelectedVideoStream(sortedVideoStreams[0]?.id || "");
    setSelectedAudioStream(sortedAudioStreams[0]?.id || "");
    setSelectedQuality(80);
    setVideoStep("config");
  });

  const handleAnalyzeVideo = useMemoizedFn(async () => {
    const targetUrl = videoUrl.trim();
    if (!targetUrl) {
      setVideoError("请输入视频链接");
      return;
    }

    const provider = detectVideoProvider(targetUrl);
    if (provider === "unsupported") {
      setVideoError("仅支持 Bilibili 或 YouTube 链接");
      return;
    }

    setIsAnalyzing(true);
    setVideoError(null);

    try {
      if (provider === "bilibili") {
        await handleAnalyzeBilibili(targetUrl);
      } else {
        await handleAnalyzeYoutube(targetUrl);
      }
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "分析失败，请稍后重试");
    } finally {
      setIsAnalyzing(false);
    }
  });

  const handleAddBilibiliVideo = useMemoizedFn(async (currentVideoInfo: BilibiliVideoInfo) => {
    const selectedOption = currentVideoInfo.qualityOptions.find(
      opt => opt.value === selectedQuality
    );
    if (!selectedOption) {
      throw new Error("请选择清晰度");
    }

    const targetUrl = videoUrl.trim();
    const sourceMeta: BilibiliSourceMeta = {
      bvid: currentVideoInfo.bvid,
      cid: currentVideoInfo.cid,
      quality: selectedQuality,
      title: currentVideoInfo.title,
      thumbnail: currentVideoInfo.cover,
    };

    const resource = await createVLResource({
      projectId,
      name: `${currentVideoInfo.title}.mp4`,
      originalPath: targetUrl,
      resourceType: "video",
      sourceType: "bilibili",
      sourceMetaInfo: JSON.stringify(sourceMeta),
    });

    await addVLIndexTask({
      resourceId: resource.id,
      projectId,
      mainDbName,
      originalPath: targetUrl,
      resourceName: `${currentVideoInfo.title}.mp4`,
      type: "full",
    });
  });

  const handleAddYoutubeVideo = useMemoizedFn(async (currentVideoInfo: YoutubeVideoInfoState) => {
    const videoStream = currentVideoInfo.videoStreams.find(
      stream => stream.id === selectedVideoStream
    );
    const audioStream = currentVideoInfo.audioStreams.find(
      stream => stream.id === selectedAudioStream
    );
    if (!videoStream || !audioStream) {
      throw new Error("请选择视频流和音频流");
    }

    const sourceUrl = currentVideoInfo.url || videoUrl.trim();
    const sourceMeta: YoutubeSourceMeta = {
      url: sourceUrl,
      videoStream: videoStream.id,
      audioStream: audioStream.id,
      title: currentVideoInfo.title,
    };

    const resource = await createVLResource({
      projectId,
      name: `${currentVideoInfo.title}.mp4`,
      originalPath: sourceUrl,
      resourceType: "video",
      sourceType: "youtube",
      sourceMetaInfo: JSON.stringify(sourceMeta),
    });

    await addVLIndexTask({
      resourceId: resource.id,
      projectId,
      mainDbName,
      originalPath: sourceUrl,
      resourceName: `${currentVideoInfo.title}.mp4`,
      type: "full",
    });
  });

  const handleAddVideo = useMemoizedFn(async () => {
    if (!videoInfo) return;
    setVideoStep("adding");
    setVideoError(null);

    try {
      if (videoInfo.provider === "bilibili") {
        await handleAddBilibiliVideo(videoInfo);
      } else {
        await handleAddYoutubeVideo(videoInfo);
      }

      setVideoStep("done");
      toast.success("视频添加成功，正在后台处理...");
      onSuccess();

      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error("Add video failed:", err);
      const errorMessage = err instanceof Error ? err.message : "添加视频失败，请稍后重试";
      setVideoError(errorMessage);
      setVideoStep("config");
    }
  });

  // 返回视频输入步骤
  const handleVideoBack = useMemoizedFn(() => {
    setVideoStep("input");
    setVideoInfo(null);
    setSelectedQuality(80);
    setSelectedVideoStream("");
    setSelectedAudioStream("");
    setVideoError(null);
  });

  // 获取资源名称：有 title 用 title，没有则截取 Markdown 前 10 个字符
  const getResourceName = useMemoizedFn((note: SearchResult): string => {
    if (note.title && note.title.trim()) {
      return note.title;
    }
    // 卡片等无 title 的类型，从内容截取
    const markdown = getMarkdown(note.content);
    const preview = markdown
      .replace(/[#*`\[\]]/g, "")
      .trim()
      .slice(0, 10);
    return preview || "未命名笔记";
  });

  // 添加笔记资源
  const handleAddNote = useMemoizedFn(async (note: SearchResult) => {
    setNoteStep("processing");
    setNoteError(null);

    try {
      const resourceName = getResourceName(note);
      await ensureVLNoteResource({
        projectId,
        mainDbName,
        contentId: note.contentId,
        title: resourceName,
        noteType: note.type,
        originalId: note.id,
      });

      setNoteStep("done");
      toast.success("笔记添加成功");
      onSuccess();

      // 延迟关闭弹窗
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error("Add note failed:", err);
      const errorMessage = err instanceof Error ? err.message : "添加笔记失败，请稍后重试";
      setNoteError(errorMessage);
      setNoteStep("search");
    }
  });

  // 渲染文件上传 Tab
  const renderFileTab = () => (
    <div className="space-y-4">
      <label
        className={`border-line-1 hover:border-accent block cursor-pointer rounded-xl border border-dashed transition-all ${
          uploading ? "pointer-events-none" : ""
        }`}
        onDragOver={event => {
          event.preventDefault();
          if (!uploading) event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={event => {
          event.preventDefault();
          if (uploading) return;
          for (const file of Array.from(event.dataTransfer.files)) {
            void handleUpload(file);
          }
        }}
      >
        <input
          type="file"
          multiple
          className="hidden"
          accept={ACCEPTED_UPLOAD_TYPES}
          disabled={uploading}
          onChange={event => {
            for (const file of Array.from(event.target.files ?? [])) {
              void handleUpload(file);
            }
            event.target.value = "";
          }}
        />
        <div className="py-8">
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="text-accent h-10 w-10 animate-spin" strokeWidth={1.75} />
              <p className="text-ink-2 m-0 text-sm">上传中...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="bg-accent-soft flex h-14 w-14 items-center justify-center rounded-full">
                <UploadIcon className="text-accent h-6 w-6" />
              </div>
              <div>
                <p className="text-ink-2 m-0 text-sm font-medium">点击或拖拽文件上传</p>
                <p className="text-ink-2 m-0 mt-1 text-xs">支持 PDF、Word、音视频等格式</p>
              </div>
            </div>
          )}
        </div>
      </label>

      {/* 已上传文件列表 */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-ink-2 text-xs font-medium">已上传</p>
          <div className="space-y-1.5">
            {uploadedFiles.map((fileName, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-ok/10 text-status-success flex items-center gap-2 rounded-lg px-3 py-2"
              >
                <Check className="h-4 w-4" strokeWidth={1.75} />
                <span className="truncate text-sm">{fileName}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // 渲染网址输入 Tab
  const renderUrlTab = () => (
    <div className="space-y-4">
      <div>
        <label className="text-ink-2 mb-2 block text-[11px] font-semibold uppercase tracking-wider">
          网页地址
        </label>
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com/article"
          disabled={processingStep !== "idle"}
          className={classNames(
            "w-full rounded-xl px-4 py-3 text-sm outline-none transition-all",
            "border-line-1 border",
            "text-ink-1 placeholder:text-ink-3",
            "focus:ring-accent/20 focus:border-accent focus:ring-2",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        />
      </div>

      <div>
        <label className="text-ink-2 mb-2 block text-[11px] font-semibold uppercase tracking-wider">
          资源标题
          <span className="text-ink-3 ml-1 font-normal normal-case">（可选，留空则自动提取）</span>
        </label>
        <input
          type="text"
          value={resourceTitle}
          onChange={e => setResourceTitle(e.target.value)}
          placeholder="留空将自动从网页标题提取"
          disabled={processingStep !== "idle"}
          className={classNames(
            "w-full rounded-xl px-4 py-3 text-sm outline-none transition-all",
            "border-line-1 border",
            "text-ink-1 placeholder:text-ink-3",
            "focus:ring-accent/20 focus:border-accent focus:ring-2",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
          onKeyDown={e => {
            if (e.key === "Enter" && processingStep === "idle") {
              handleClipUrl();
            }
          }}
        />
      </div>

      {/* 处理状态显示 */}
      {processingStep !== "idle" && processingStep !== "done" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center py-8"
        >
          <div className="relative">
            <div className="bg-accent-soft flex h-16 w-16 items-center justify-center rounded-full">
              <Globe className="text-accent h-7 w-7" strokeWidth={1.75} />
            </div>
            <motion.div
              className="border-accent absolute inset-0 h-16 w-16 rounded-full border-2 border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          </div>
          <p className="text-ink-2 mt-4 text-sm font-medium">
            {processingStep === "fetching" && "正在获取网页内容..."}
            {processingStep === "extracting" && "正在提取文章内容..."}
            {processingStep === "saving" && "正在保存资源..."}
          </p>
        </motion.div>
      )}

      {/* 成功状态 */}
      {processingStep === "done" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center py-8"
        >
          <div className="bg-ok/10 flex h-16 w-16 items-center justify-center rounded-full">
            <Check className="text-status-success h-8 w-8" strokeWidth={1.75} />
          </div>
          <p className="text-status-success mt-4 text-sm font-medium">剪藏成功</p>
        </motion.div>
      )}

      {/* 错误提示 */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" strokeWidth={1.75} />
          <div>
            <p className="text-danger m-0 text-sm font-medium">剪藏失败</p>
            <p className="text-danger/80 m-0 mt-1 text-xs">{error}</p>
          </div>
        </motion.div>
      )}
    </div>
  );

  // 渲染视频 Tab
  const renderVideoTab = () => (
    <div className="space-y-4">
      {videoStep === "input" && (
        <>
          <div>
            <label className="text-ink-2 mb-2 block text-[11px] font-semibold uppercase tracking-wider">
              Bilibili / YouTube 视频链接
            </label>
            <input
              ref={videoInputRef}
              type="url"
              value={videoUrl}
              onChange={e => {
                setVideoUrl(e.target.value);
                setVideoError(null);
              }}
              placeholder="在此粘贴 Bilibili 或 YouTube 链接..."
              disabled={isAnalyzing}
              onKeyDown={e => {
                if (e.key === "Enter" && !isAnalyzing) {
                  handleAnalyzeVideo();
                }
              }}
              className={classNames(
                "w-full rounded-xl px-4 py-3.5 text-sm outline-none transition-all",
                "border-line-1 border",
                "text-ink-1 placeholder:text-ink-3",
                "focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20",
                "disabled:cursor-not-allowed disabled:opacity-60"
              )}
            />
          </div>

          {videoError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-600">
              {videoError}
            </div>
          )}
        </>
      )}

      {videoStep === "config" && videoInfo && (
        <>
          {/* 视频预览 */}
          <div className="border-line-1 flex items-center gap-3 border-b pb-4">
            {videoInfo.cover && (
              <LocalImage
                url={videoInfo.cover}
                alt={videoInfo.title}
                className="border-line-1 h-[54px] w-24 shrink-0 rounded-lg border object-cover shadow-sm"
              />
            )}
            <div className="min-w-0 flex-1">
              <h3
                className="text-ink-1 m-0 overflow-hidden text-ellipsis whitespace-nowrap pr-2 text-sm font-semibold"
                title={videoInfo.title}
              >
                {videoInfo.title}
              </h3>
              <p className="text-ink-2 mt-1 text-xs">
                {videoInfo.provider === "bilibili"
                  ? "请选择清晰度"
                  : "默认已选择最高可用流，可按需调整"}
              </p>
            </div>
          </div>

          {videoInfo.provider === "bilibili" ? (
            <div>
              <label className="text-ink-2 mb-2 block text-[11px] font-semibold uppercase tracking-wider">
                清晰度
              </label>
              <div className="relative">
                <select
                  value={selectedQuality}
                  onChange={e => setSelectedQuality(Number(e.target.value))}
                  className={classNames(
                    "w-full cursor-pointer appearance-none rounded-xl py-3 pl-4 pr-10 text-sm outline-none transition-all",
                    "border-line-1 border",
                    "text-ink-1",
                    "focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20"
                  )}
                >
                  {videoInfo.qualityOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                      {opt.needVip ? " · 大会员" : opt.needLogin ? " · 需登录" : ""}
                    </option>
                  ))}
                </select>
                <svg
                  className="text-ink-3 pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-ink-2 mb-2 block text-[11px] font-semibold uppercase tracking-wider">
                  视频流
                </label>
                <div className="relative">
                  <select
                    value={selectedVideoStream}
                    onChange={e => setSelectedVideoStream(e.target.value)}
                    className={classNames(
                      "w-full cursor-pointer appearance-none rounded-xl py-3 pl-4 pr-10 text-sm outline-none transition-all",
                      "border-line-1 border",
                      "text-ink-1",
                      "focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20"
                    )}
                  >
                    {videoInfo.videoStreams.map(stream => (
                      <option key={stream.id} value={stream.id}>
                        {stream.resolution} · {stream.format?.toUpperCase()} ·{" "}
                        {stream.codecs || "unknown"}
                        {stream.fps ? ` · ${stream.fps}fps` : ""}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="text-ink-3 pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>
              <div>
                <label className="text-ink-2 mb-2 block text-[11px] font-semibold uppercase tracking-wider">
                  音频流
                </label>
                <div className="relative">
                  <select
                    value={selectedAudioStream}
                    onChange={e => setSelectedAudioStream(e.target.value)}
                    className={classNames(
                      "w-full cursor-pointer appearance-none rounded-xl py-3 pl-4 pr-10 text-sm outline-none transition-all",
                      "border-line-1 border",
                      "text-ink-1",
                      "focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20"
                    )}
                  >
                    {videoInfo.audioStreams.map(stream => (
                      <option key={stream.id} value={stream.id}>
                        {stream.format?.toUpperCase()} · {stream.codecs || "unknown"}
                        {stream.bitrate ? ` · ${Math.round(stream.bitrate / 1024)}kbps` : ""}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="text-ink-3 pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>
            </>
          )}

          {videoError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-600">
              {videoError}
            </div>
          )}
        </>
      )}

      {videoStep === "adding" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center py-8"
        >
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-pink-50">
              <Video className="h-7 w-7 text-pink-500" strokeWidth={1.75} />
            </div>
            <motion.div
              className="absolute inset-0 h-16 w-16 rounded-full border-2 border-pink-500 border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          </div>
          <p className="text-ink-2 mt-4 text-sm font-medium">正在添加视频...</p>
        </motion.div>
      )}

      {videoStep === "done" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center py-8"
        >
          <div className="bg-ok/10 flex h-16 w-16 items-center justify-center rounded-full">
            <Check className="text-status-success h-8 w-8" strokeWidth={1.75} />
          </div>
          <p className="text-status-success mt-4 text-sm font-medium">添加成功</p>
          <p className="text-ink-2 mt-1 text-xs">视频正在后台下载和处理中...</p>
        </motion.div>
      )}
    </div>
  );

  // 渲染笔记 Tab
  const renderNoteTab = () => (
    <div className="space-y-4">
      {noteStep === "search" && (
        <>
          <NoteSelector
            onSelect={handleAddNote}
            extensions={extensions}
            emptyDescription="搜索已有的卡片、文章、项目文档、日记等内容"
          />
          {noteError && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" strokeWidth={1.75} />
              <div>
                <p className="text-danger m-0 text-sm font-medium">添加失败</p>
                <p className="text-danger/80 m-0 mt-1 text-xs">{noteError}</p>
              </div>
            </motion.div>
          )}
        </>
      )}

      {noteStep === "processing" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center py-8"
        >
          <div className="relative">
            <div className="bg-accent-soft flex h-16 w-16 items-center justify-center rounded-full">
              <StickyNote className="text-accent h-7 w-7" strokeWidth={1.75} />
            </div>
            <motion.div
              className="border-accent absolute inset-0 h-16 w-16 rounded-full border-2 border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          </div>
          <p className="text-ink-2 mt-4 text-sm font-medium">正在添加笔记...</p>
        </motion.div>
      )}

      {noteStep === "done" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center py-8"
        >
          <div className="bg-ok/10 flex h-16 w-16 items-center justify-center rounded-full">
            <Check className="text-status-success h-8 w-8" strokeWidth={1.75} />
          </div>
          <p className="text-status-success mt-4 text-sm font-medium">添加成功</p>
        </motion.div>
      )}
    </div>
  );

  // 按钮样式
  const primaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
    "bg-accent text-white",
    "hover:bg-accent-hover",
    "disabled:bg-sunken disabled:text-ink-3 disabled:cursor-not-allowed"
  );

  const secondaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
    "bg-hover text-ink-2",
    "hover:bg-hover",
    "border border-line-1"
  );

  // 渲染底部按钮
  const renderFooter = () => {
    if (activeTab === "file") {
      return (
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            {uploadedFiles.length > 0 ? "完成" : "取消"}
          </button>
        </div>
      );
    }

    if (activeTab === "url") {
      return (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className={secondaryButtonClass}
            disabled={processingStep !== "idle" && processingStep !== "done"}
          >
            取消
          </button>
          {processingStep === "idle" && (
            <button
              type="button"
              onClick={handleClipUrl}
              disabled={!url.trim()}
              className={classNames(primaryButtonClass, "flex items-center gap-2")}
            >
              <Globe className="h-4 w-4" strokeWidth={1.75} />
              开始剪藏
            </button>
          )}
        </div>
      );
    }

    // 视频 Tab
    if (activeTab === "video") {
      if (videoStep === "input") {
        return (
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>
              取消
            </button>
            <button
              type="button"
              onClick={handleAnalyzeVideo}
              disabled={!videoUrl.trim() || isAnalyzing}
              className={classNames(
                "rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200",
                "bg-pink-500 text-white",
                "hover:bg-pink-600",
                "disabled:bg-sunken disabled:text-ink-3 disabled:cursor-not-allowed",
                "flex items-center gap-2"
              )}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                  正在分析...
                </>
              ) : (
                <>
                  <Video className="h-4 w-4" strokeWidth={1.75} />
                  开始分析
                </>
              )}
            </button>
          </div>
        );
      }

      if (videoStep === "config") {
        return (
          <div className="flex justify-end gap-3">
            <button type="button" onClick={handleVideoBack} className={secondaryButtonClass}>
              返回
            </button>
            <button
              type="button"
              onClick={handleAddVideo}
              className={classNames(
                "rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200",
                "bg-accent text-white",
                "hover:bg-accent-hover",
                "flex items-center gap-2"
              )}
            >
              <Check className="h-4 w-4" strokeWidth={1.75} />
              确认添加
            </button>
          </div>
        );
      }

      // adding 或 done 状态
      return (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className={secondaryButtonClass}
            disabled={videoStep === "adding"}
          >
            {videoStep === "done" ? "完成" : "取消"}
          </button>
        </div>
      );
    }

    // 笔记 Tab
    if (activeTab === "note") {
      return (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className={secondaryButtonClass}
            disabled={noteStep === "processing"}
          >
            {noteStep === "done" ? "完成" : "取消"}
          </button>
        </div>
      );
    }

    return null;
  };

  // 判断是否可以关闭弹窗
  const canClose =
    (processingStep === "idle" || processingStep === "done") &&
    (videoStep === "input" || videoStep === "done") &&
    (noteStep === "search" || noteStep === "done");

  return (
    <CustomModal
      open={open}
      onCancel={onClose}
      width={520}
      centered
      destroyOnClose
      title="添加资料"
      subtitle="上传文件、剪藏网页或添加视频"
      icon={<Plus className="text-ink-2 h-5 w-5" strokeWidth={1.75} />}
      footer={renderFooter()}
      showCloseButton={canClose}
    >
      {/* 隐藏的 Webview 用于加载动态网页 */}
      {webviewUrl && (
        <div className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <Webview
            ref={webviewRef}
            src={webviewUrl}
            onLoad={handleWebviewLoad}
            onError={handleWebviewError}
          />
        </div>
      )}

      {/* Tab 切换 */}
      <div className="bg-hover mb-5 flex gap-1 rounded-xl p-1">
        <button
          type="button"
          onClick={() => setActiveTab("file")}
          disabled={
            (processingStep !== "idle" && processingStep !== "done") ||
            (videoStep !== "input" && videoStep !== "done") ||
            (noteStep !== "search" && noteStep !== "done")
          }
          className={classNames(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
            activeTab === "file"
              ? "bg-surface text-ink-1 shadow-sm"
              : "text-ink-2 hover:text-ink-2",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <FileText className="h-4 w-4" strokeWidth={1.75} />
          文件
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("url")}
          disabled={
            (processingStep !== "idle" && processingStep !== "done") ||
            (videoStep !== "input" && videoStep !== "done") ||
            (noteStep !== "search" && noteStep !== "done")
          }
          className={classNames(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
            activeTab === "url" ? "bg-surface text-ink-1 shadow-sm" : "text-ink-2 hover:text-ink-2",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <Globe className="h-4 w-4" strokeWidth={1.75} />
          网页
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("video")}
          disabled={
            (processingStep !== "idle" && processingStep !== "done") ||
            (videoStep !== "input" && videoStep !== "done") ||
            (noteStep !== "search" && noteStep !== "done")
          }
          className={classNames(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
            activeTab === "video"
              ? "bg-surface text-ink-1 shadow-sm"
              : "text-ink-2 hover:text-ink-2",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <Video className="h-4 w-4" strokeWidth={1.75} />
          视频
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("note")}
          disabled={
            (processingStep !== "idle" && processingStep !== "done") ||
            (videoStep !== "input" && videoStep !== "done") ||
            (noteStep !== "search" && noteStep !== "done")
          }
          className={classNames(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
            activeTab === "note"
              ? "bg-surface text-ink-1 shadow-sm"
              : "text-ink-2 hover:text-ink-2",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <StickyNote className="h-4 w-4" strokeWidth={1.75} />
          笔记
        </button>
      </div>

      {/* Tab 内容 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "file" && renderFileTab()}
          {activeTab === "url" && renderUrlTab()}
          {activeTab === "video" && renderVideoTab()}
          {activeTab === "note" && renderNoteTab()}
        </motion.div>
      </AnimatePresence>
    </CustomModal>
  );
});

AddResourceModal.displayName = "AddResourceModal";

export default AddResourceModal;
