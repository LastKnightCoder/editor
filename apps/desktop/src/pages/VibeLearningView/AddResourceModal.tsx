import { memo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, App } from "antd";
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
import type { UploadProps } from "antd";

import CustomModal from "@/components/CustomModal";
import LocalImage from "@/components/LocalImage";
import { createVLResource, addVLIndexTask } from "@/commands/vibe-learning";
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
import { getMarkdown } from "@/utils";
import useSettingStore from "@/stores/useSettingStore";
import type {
  VLResourceType,
  BilibiliSourceMeta,
  NoteSourceMeta,
} from "@/types/vibe-learning";
import type { SearchResult } from "@/types/search";
import NoteSelector from "./AppSidebar/components/NoteSelector";
import useEditorExtensions from "@/hooks/useDynamicExtensions";

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

// 视频信息接口
interface VideoInfo {
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
  const { message } = App.useApp();
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
  const loadWithWebview = useMemoizedFn(
    (targetUrl: string): Promise<string> => {
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
    },
  );

  // Webview 加载完成回调
  const handleWebviewLoad = useMemoizedFn(async () => {
    // 等待额外时间让动态内容（JavaScript）加载完成
    await new Promise((resolve) => setTimeout(resolve, 3000));

    try {
      const html = await webviewRef.current?.getHTML();
      if (html && webviewLoadResolve.current) {
        webviewLoadResolve.current(html);
      } else if (webviewLoadReject.current) {
        webviewLoadReject.current(new Error("无法获取网页内容"));
      }
    } catch (err) {
      if (webviewLoadReject.current) {
        webviewLoadReject.current(
          err instanceof Error ? err : new Error("获取网页内容失败"),
        );
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

      setUploadedFiles((prev) => [...prev, file.name]);
      message.success(`上传成功: ${file.name}`);
      onSuccess();
    } catch (error) {
      console.error("Upload failed:", error);
      message.error(`上传失败: ${file.name}`);
    } finally {
      setUploading(false);
    }

    return false; // 阻止默认上传行为
  });

  // 网址剪藏处理
  const handleClipUrl = useMemoizedFn(async () => {
    if (!url.trim()) {
      message.warning("请输入网址");
      return;
    }

    if (!isValidUrl(url.trim())) {
      message.error("请输入有效的网址（以 http:// 或 https:// 开头）");
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
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          },
        });

        // nodeFetch 默认返回 res.data，对于 HTML 请求就是字符串
        const fetchedHtml =
          typeof response === "string" ? response : String(response);
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
        finalTitle =
          pageTitle ||
          extractTitleFromHtml(html) ||
          extractNameFromUrl(url.trim());
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
        }),
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
      message.success("网页剪藏成功");
      onSuccess();

      // 延迟关闭弹窗
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error("Clip URL failed:", err);
      const errorMessage =
        err instanceof Error ? err.message : "剪藏失败，请稍后重试";
      setError(errorMessage);
      setProcessingStep("idle");
    }
  });

  // 分析 Bilibili 视频
  const handleAnalyzeVideo = useMemoizedFn(async () => {
    if (!videoUrl.trim()) {
      setVideoError("请输入 Bilibili 链接");
      return;
    }

    if (!isBilibiliUrl(videoUrl)) {
      setVideoError("请输入有效的 Bilibili 链接");
      return;
    }

    setIsAnalyzing(true);
    setVideoError(null);

    try {
      const credentials = setting.integration.bilibili.credentials;
      const info = await getVideoInfoByUrl(videoUrl, credentials);

      if (!info) {
        setVideoError("无法获取视频信息，请检查链接是否正确");
        return;
      }

      const qualityInfo = await getQualityInfo(
        info.cid,
        info.bvid,
        credentials,
      );
      const options = getQualityOptions(qualityInfo.accept_quality);

      if (options.length === 0) {
        setVideoError("未找到可用的清晰度选项");
        return;
      }

      // 设置默认质量
      const hasLogin = !!credentials.SESSDATA;
      const hasVip =
        !!setting.integration.bilibili.userInfo.vipStatus && hasLogin;
      let defaultQuality: number;
      if (hasVip) {
        defaultQuality = options[0]?.value || 80;
      } else if (hasLogin) {
        const maxQuality = Math.max(
          ...options.filter((opt) => opt.value <= 80).map((opt) => opt.value),
        );
        defaultQuality = maxQuality || 64;
      } else {
        const maxQuality = Math.max(
          ...options.filter((opt) => opt.value <= 64).map((opt) => opt.value),
        );
        defaultQuality = maxQuality || 32;
      }

      setVideoInfo({
        bvid: info.bvid,
        cid: info.cid,
        title: info.title,
        cover: info.cover,
        qualityOptions: options,
      });
      setSelectedQuality(defaultQuality);
      setVideoStep("config");
    } catch (err) {
      setVideoError(
        err instanceof Error ? err.message : "分析失败，请稍后重试",
      );
    } finally {
      setIsAnalyzing(false);
    }
  });

  // 添加 Bilibili 视频资源
  const handleAddBilibiliVideo = useMemoizedFn(async () => {
    if (!videoInfo) return;

    const selectedOption = videoInfo.qualityOptions.find(
      (opt) => opt.value === selectedQuality,
    );

    if (!selectedOption) {
      setVideoError("请选择清晰度");
      return;
    }

    setVideoStep("adding");
    setVideoError(null);

    try {
      // 构建来源元信息
      const sourceMeta: BilibiliSourceMeta = {
        bvid: videoInfo.bvid,
        cid: videoInfo.cid,
        quality: selectedQuality,
        title: videoInfo.title,
        thumbnail: videoInfo.cover,
      };

      // 创建资源记录
      const resource = await createVLResource({
        projectId,
        name: `${videoInfo.title}.mp4`,
        originalPath: videoUrl, // 保存原始 URL
        resourceType: "video",
        sourceType: "bilibili",
        sourceMetaInfo: JSON.stringify(sourceMeta),
      });

      // 添加索引任务（后端会处理下载、转录、索引）
      await addVLIndexTask({
        resourceId: resource.id,
        projectId,
        mainDbName,
        originalPath: videoUrl,
        resourceName: `${videoInfo.title}.mp4`,
        type: "full",
      });

      setVideoStep("done");
      message.success("视频添加成功，正在后台处理...");
      onSuccess();

      // 延迟关闭弹窗
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error("Add Bilibili video failed:", err);
      const errorMessage =
        err instanceof Error ? err.message : "添加视频失败，请稍后重试";
      setVideoError(errorMessage);
      setVideoStep("config");
    }
  });

  // 返回视频输入步骤
  const handleVideoBack = useMemoizedFn(() => {
    setVideoStep("input");
    setVideoInfo(null);
    setSelectedQuality(80);
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

      // 1. 创建资源记录（存储 contentId 等信息供后端使用）
      const sourceMeta: NoteSourceMeta = {
        contentId: note.contentId,
        type: note.type,
        title: resourceName,
        originalId: note.id,
      };

      const resource = await createVLResource({
        projectId,
        name: `${resourceName}.md`,
        originalPath: `note://${note.contentId}`, // 特殊标识
        resourceType: "md",
        sourceType: "note",
        sourceMetaInfo: JSON.stringify(sourceMeta),
      });

      // 2. 添加索引任务（后端会根据 sourceType=note 自动从数据库获取内容）
      await addVLIndexTask({
        resourceId: resource.id,
        projectId,
        mainDbName,
        originalPath: `note://${note.contentId}`,
        resourceName: `${resourceName}.md`,
        type: "full",
      });

      setNoteStep("done");
      message.success("笔记添加成功");
      onSuccess();

      // 延迟关闭弹窗
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error("Add note failed:", err);
      const errorMessage =
        err instanceof Error ? err.message : "添加笔记失败，请稍后重试";
      setNoteError(errorMessage);
      setNoteStep("search");
    }
  });

  // 上传组件配置
  const uploadProps: UploadProps = {
    name: "file",
    multiple: true,
    showUploadList: false,
    beforeUpload: handleUpload,
    accept:
      ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.html,.mp3,.wav,.m4a,.ogg,.flac,.aac,.mp4,.webm,.mov,.avi,.mkv,.jpg,.jpeg,.png,.gif,.webp,.bmp",
  };

  // 渲染文件上传 Tab
  const renderFileTab = () => (
    <div className="space-y-4">
      <Upload.Dragger
        {...uploadProps}
        disabled={uploading}
        className="bg-gray-50! dark:bg-gray-800/50! border-dashed! border-gray-200! dark:border-gray-700! rounded-xl! hover:border-blue-500! transition-all"
      >
        <div className="py-8">
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p className="text-sm text-gray-600 dark:text-gray-400 m-0">
                上传中...
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                <UploadIcon className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200 m-0">
                  点击或拖拽文件上传
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 m-0">
                  支持 PDF、Word、音视频等格式
                </p>
              </div>
            </div>
          )}
        </div>
      </Upload.Dragger>

      {/* 已上传文件列表 */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            已上传
          </p>
          <div className="space-y-1.5">
            {uploadedFiles.map((fileName, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400"
              >
                <Check className="w-4 h-4" />
                <span className="text-sm truncate">{fileName}</span>
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
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 block mb-2">
          网页地址
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/article"
          disabled={processingStep !== "idle"}
          className={classNames(
            "w-full px-4 py-3 rounded-xl text-sm outline-none transition-all",
            "bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700",
            "text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500",
            "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        />
      </div>

      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 block mb-2">
          资源标题
          <span className="text-gray-400 dark:text-gray-500 font-normal normal-case ml-1">
            （可选，留空则自动提取）
          </span>
        </label>
        <input
          type="text"
          value={resourceTitle}
          onChange={(e) => setResourceTitle(e.target.value)}
          placeholder="留空将自动从网页标题提取"
          disabled={processingStep !== "idle"}
          className={classNames(
            "w-full px-4 py-3 rounded-xl text-sm outline-none transition-all",
            "bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700",
            "text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500",
            "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
          onKeyDown={(e) => {
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
            <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
              <Globe className="w-7 h-7 text-blue-500" />
            </div>
            <motion.div
              className="absolute inset-0 w-16 h-16 rounded-full border-2 border-blue-500 border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mt-4">
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
          <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-500/10 flex items-center justify-center">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-sm font-medium text-green-600 dark:text-green-400 mt-4">
            剪藏成功
          </p>
        </motion.div>
      )}

      {/* 错误提示 */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20"
        >
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-600 dark:text-red-400 m-0">
              剪藏失败
            </p>
            <p className="text-xs text-red-500 dark:text-red-400/80 mt-1 m-0">
              {error}
            </p>
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
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 block mb-2">
              Bilibili 视频链接
            </label>
            <input
              ref={videoInputRef}
              type="url"
              value={videoUrl}
              onChange={(e) => {
                setVideoUrl(e.target.value);
                setVideoError(null);
              }}
              placeholder="在此粘贴 Bilibili 链接..."
              disabled={isAnalyzing}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isAnalyzing) {
                  handleAnalyzeVideo();
                }
              }}
              className={classNames(
                "w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all",
                "bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700",
                "text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500",
                "focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              )}
            />
          </div>

          {videoError && (
            <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
              {videoError}
            </div>
          )}
        </>
      )}

      {videoStep === "config" && videoInfo && (
        <>
          {/* 视频预览 */}
          <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
            {videoInfo.cover && (
              <LocalImage
                url={videoInfo.cover}
                alt={videoInfo.title}
                className="w-24 h-[54px] object-cover rounded-lg shrink-0 border border-gray-200 dark:border-gray-700 shadow-sm"
              />
            )}
            <div className="flex-1 min-w-0">
              <h3
                className="text-sm font-semibold m-0 overflow-hidden text-ellipsis whitespace-nowrap pr-2 text-gray-800 dark:text-white"
                title={videoInfo.title}
              >
                {videoInfo.title}
              </h3>
              <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                请选择清晰度
              </p>
            </div>
          </div>

          {/* 清晰度选择 */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 block mb-2">
              清晰度
            </label>
            <div className="relative">
              <select
                value={selectedQuality}
                onChange={(e) => setSelectedQuality(Number(e.target.value))}
                className={classNames(
                  "w-full py-3 pl-4 pr-10 rounded-xl text-sm outline-none appearance-none cursor-pointer transition-all",
                  "bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700",
                  "text-gray-800 dark:text-white",
                  "focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20",
                )}
              >
                {videoInfo.qualityOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                    {opt.needVip
                      ? " · 大会员"
                      : opt.needLogin
                        ? " · 需登录"
                        : ""}
                  </option>
                ))}
              </select>
              <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-400 dark:text-gray-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>

          {videoError && (
            <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
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
            <div className="w-16 h-16 rounded-full bg-pink-50 dark:bg-pink-500/10 flex items-center justify-center">
              <Video className="w-7 h-7 text-pink-500" />
            </div>
            <motion.div
              className="absolute inset-0 w-16 h-16 rounded-full border-2 border-pink-500 border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mt-4">
            正在添加视频...
          </p>
        </motion.div>
      )}

      {videoStep === "done" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center py-8"
        >
          <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-500/10 flex items-center justify-center">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-sm font-medium text-green-600 dark:text-green-400 mt-4">
            添加成功
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            视频正在后台下载和处理中...
          </p>
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
            emptyDescription="搜索已有的卡片、文章、知识库等内容"
          />
          {noteError && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20"
            >
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400 m-0">
                  添加失败
                </p>
                <p className="text-xs text-red-500 dark:text-red-400/80 mt-1 m-0">
                  {noteError}
                </p>
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
            <div className="w-16 h-16 rounded-full bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center">
              <StickyNote className="w-7 h-7 text-purple-500" />
            </div>
            <motion.div
              className="absolute inset-0 w-16 h-16 rounded-full border-2 border-purple-500 border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mt-4">
            正在添加笔记...
          </p>
        </motion.div>
      )}

      {noteStep === "done" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center py-8"
        >
          <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-500/10 flex items-center justify-center">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <p className="text-sm font-medium text-green-600 dark:text-green-400 mt-4">
            添加成功
          </p>
        </motion.div>
      )}
    </div>
  );

  // 按钮样式
  const primaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
    "bg-blue-500 text-white",
    "hover:bg-blue-600",
    "disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed",
  );

  const secondaryButtonClass = classNames(
    "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
    "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",
    "hover:bg-gray-200 dark:hover:bg-gray-700",
    "border border-gray-200 dark:border-gray-700",
  );

  // 渲染底部按钮
  const renderFooter = () => {
    if (activeTab === "file") {
      return (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className={secondaryButtonClass}
          >
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
              className={classNames(
                primaryButtonClass,
                "flex items-center gap-2",
              )}
            >
              <Globe className="w-4 h-4" />
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
            <button
              type="button"
              onClick={onClose}
              className={secondaryButtonClass}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleAnalyzeVideo}
              disabled={!videoUrl.trim() || isAnalyzing}
              className={classNames(
                "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                "bg-pink-500 text-white",
                "hover:bg-pink-600",
                "disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed",
                "flex items-center gap-2",
              )}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  正在分析...
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
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
            <button
              type="button"
              onClick={handleVideoBack}
              className={secondaryButtonClass}
            >
              返回
            </button>
            <button
              type="button"
              onClick={handleAddBilibiliVideo}
              className={classNames(
                "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                "bg-emerald-500 text-white",
                "hover:bg-emerald-600",
                "flex items-center gap-2",
              )}
            >
              <Check className="w-4 h-4" />
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
      icon={<Plus className="w-5 h-5 text-blue-500" />}
      iconBgColor="bg-blue-50 dark:bg-blue-500/20 border-blue-200 dark:border-blue-500/30"
      footer={renderFooter()}
      showCloseButton={canClose}
    >
      {/* 隐藏的 Webview 用于加载动态网页 */}
      {webviewUrl && (
        <div className="absolute -left-[9999px] w-px h-px overflow-hidden">
          <Webview
            ref={webviewRef}
            src={webviewUrl}
            onLoad={handleWebviewLoad}
            onError={handleWebviewError}
          />
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex gap-1 p-1 mb-5 bg-gray-100 dark:bg-gray-800 rounded-xl">
        <button
          type="button"
          onClick={() => setActiveTab("file")}
          disabled={
            (processingStep !== "idle" && processingStep !== "done") ||
            (videoStep !== "input" && videoStep !== "done") ||
            (noteStep !== "search" && noteStep !== "done")
          }
          className={classNames(
            "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
            activeTab === "file"
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <FileText className="w-4 h-4" />
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
            "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
            activeTab === "url"
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <Globe className="w-4 h-4" />
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
            "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
            activeTab === "video"
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <Video className="w-4 h-4" />
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
            "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
            activeTab === "note"
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <StickyNote className="w-4 h-4" />
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
