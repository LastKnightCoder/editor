import { memo, useState, useEffect, useRef, type ReactNode } from "react";
import {
  Check,
  Clapperboard,
  FileText,
  Globe,
  NotebookPen,
  Plus,
  Upload as UploadIcon,
} from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { Button, Dialog, DialogBody, Segmented, Select, Spinner, cn, toast } from "@tau/ui";
import { ResourceSelectInput } from "@/components/ResourceSelectDialog";

import LocalImage from "@/components/LocalImage";
import { EntityPicker } from "@/components/EntityPicker";
import type { EntityCandidate, EntityKind } from "@/types/entity";
import { createVLResource, addVLIndexTask, ensureVLNoteResource } from "@/commands/vibe-learning";
import { uploadResource } from "@/hooks/useUploadResource";
import { desktopFetch } from "@/commands/fetch";
import { createSmartExtractProvider } from "@/utils/web-clipper/providers";
import { collectClipStream } from "@/utils/web-clipper/stream";
import { Webview } from "@tau/shared";
import type { WebviewRef } from "@tau/shared";
import { useOnlineVideoResolver } from "@/hooks/useOnlineVideoResolver";
import { useVideoProviders } from "@/hooks/useVideoProviders";
import { buildOnlineVideoMeta } from "@/types/online-video";
import type { VLResource, VLResourceType, NoteSourceMeta } from "@/types/vibe-learning";

const ACCEPTED_UPLOAD_TYPES =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.html,.mp3,.wav,.m4a,.ogg,.flac,.aac,.mp4,.webm,.mov,.avi,.mkv,.jpg,.jpeg,.png,.gif,.webp,.bmp";

interface AddResourceModalProps {
  open: boolean;
  projectId: number;
  mainDbName: string;
  onClose: () => void;
  onSuccess: () => void;
  /** 已有资料：挑选笔记时把已加入的置灰 */
  resources?: VLResource[];
}

type TabType = "file" | "url" | "video" | "note";
type ProcessingStep = "idle" | "fetching" | "extracting" | "saving" | "done";
type VideoPhase = "idle" | "adding" | "done";

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
  const { open, projectId, mainDbName, onClose, onSuccess, resources = [] } = props;

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
  const [videoPhase, setVideoPhase] = useState<VideoPhase>("idle");
  const { providers: videoProviders } = useVideoProviders();
  const [videoSource, setVideoSource] = useState("");
  // 选中的插件被停用时回落到第一个启用的视频插件
  const activeVideoSource = videoProviders.some(provider => provider.id === videoSource)
    ? videoSource
    : (videoProviders[0]?.id ?? "");
  const videoResolver = useOnlineVideoResolver(activeVideoSource);
  const { analyzing: isAnalyzing, error: videoError, resolved: videoInfo } = videoResolver;
  const videoStep = videoPhase !== "idle" ? videoPhase : videoInfo ? "config" : "input";
  const videoInputRef = useRef<HTMLInputElement>(null);

  // 笔记：关掉本弹窗后打开公共检索（EntityPicker）
  const [pickerOpen, setPickerOpen] = useState(false);

  // Webview 相关状态（用于加载 SPA 等动态网页）
  const webviewRef = useRef<WebviewRef>(null);
  const [webviewUrl, setWebviewUrl] = useState<string | null>(null);
  const webviewLoadResolve = useRef<((html: string) => void) | null>(null);
  const webviewLoadReject = useRef<((error: Error) => void) | null>(null);

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
    setVideoPhase("idle");
    videoResolver.reset();
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
        // uploadResource 内部吞掉了异常只返回 null，这里给出可行动的指向
        throw new Error("图床返回为空，请检查设置里的图床与密钥配置");
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
      // 带上原因：只说「上传失败」的话，图床配错、网络不通、超时都长一个样
      const reason = error instanceof Error ? error.message : String(error);
      toast.error(`${file.name} 上传失败：${reason}`);
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

      // 1. 先尝试使用 desktopFetch 快速获取网页内容
      try {
        const response = await desktopFetch(url.trim(), {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          },
        });

        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`网页读取失败: ${response.status}`);
        }
        const fetchedHtml = await response.text();
        if (fetchedHtml && fetchedHtml.trim().length > 0) {
          html = fetchedHtml;
          pageTitle = extractTitleFromHtml(html);
        }
      } catch (fetchErr) {
        console.log("desktopFetch failed, will try webview:", fetchErr);
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

  const handleAnalyzeVideo = useMemoizedFn(() => {
    if (!videoUrl.trim()) {
      videoResolver.setError("请输入视频链接");
      return;
    }
    void videoResolver.analyze(videoUrl);
  });

  const handleAddVideo = useMemoizedFn(async () => {
    const selection = videoResolver.selection();
    if (!selection) return;
    setVideoPhase("adding");
    videoResolver.setError(null);

    try {
      const name = `${selection.title}.mp4`;
      const resource = await createVLResource({
        projectId,
        name,
        originalPath: selection.url,
        resourceType: "video",
        sourceType: selection.providerId,
        sourceMetaInfo: JSON.stringify(
          buildOnlineVideoMeta(
            selection.providerId,
            selection.ref,
            selection.title,
            selection.cover
          )
        ),
      });
      await addVLIndexTask({
        resourceId: resource.id,
        projectId,
        mainDbName,
        originalPath: selection.url,
        resourceName: name,
        type: "full",
      });

      setVideoPhase("done");
      toast.success("视频添加成功，正在后台处理...");
      onSuccess();

      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error("Add video failed:", err);
      videoResolver.setError(err instanceof Error ? err.message : "添加视频失败，请稍后重试");
      setVideoPhase("idle");
    }
  });

  // 返回视频输入步骤
  const handleVideoBack = videoResolver.reset;

  // 笔记：EntityPicker 的类型 → 资料里记录的笔记类型
  const NOTE_KINDS: EntityKind[] = ["card", "article", "project_item", "diary-moment"];
  const NOTE_TYPE: Record<string, string> = {
    card: "card",
    article: "article",
    project_item: "project-item",
    "diary-moment": "diary-moment",
  };
  const linkedContentIds = new Set(
    resources
      .filter(r => r.sourceType === "note" && r.sourceMetaInfo)
      .map(r => {
        try {
          return (JSON.parse(r.sourceMetaInfo ?? "") as NoteSourceMeta).contentId;
        } catch {
          return null;
        }
      })
  );

  const handleAddNotes = useMemoizedFn(async (picked: EntityCandidate[]) => {
    let added = 0;
    for (const item of picked) {
      if (!item.contentId) continue;
      const result = await ensureVLNoteResource({
        projectId,
        mainDbName,
        contentId: item.contentId,
        title: item.title.trim() || item.excerpt.slice(0, 16) || "未命名笔记",
        noteType: NOTE_TYPE[item.kind] ?? item.kind,
        originalId: item.id,
      });
      if (result.created) added++;
    }
    onSuccess();
    toast.success(added > 0 ? `已加入 ${added} 份笔记` : "选中的笔记都已在资料里");
  });

  const busy =
    uploading ||
    (processingStep !== "idle" && processingStep !== "done") ||
    isAnalyzing ||
    videoStep === "adding";

  const fileTab = (
    <div className="flex flex-col gap-3">
      <label
        className={cn(
          "border-line-1 rounded-tau-md hover:border-accent hover:bg-accent-soft/40 flex cursor-pointer flex-col items-center gap-2 border border-dashed px-6 py-8 text-center transition-colors",
          uploading && "pointer-events-none"
        )}
        onDragOver={event => {
          event.preventDefault();
          if (!uploading) event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={event => {
          event.preventDefault();
          if (uploading) return;
          for (const file of Array.from(event.dataTransfer.files)) void handleUpload(file);
        }}
      >
        <input
          type="file"
          multiple
          className="hidden"
          accept={ACCEPTED_UPLOAD_TYPES}
          disabled={uploading}
          onChange={event => {
            for (const file of Array.from(event.target.files ?? [])) void handleUpload(file);
            event.target.value = "";
          }}
        />
        {uploading ? (
          <Spinner className="size-5" />
        ) : (
          <UploadIcon className="text-ink-2 size-5" strokeWidth={1.75} />
        )}
        <span className="text-tau-body text-ink-1 font-medium">
          {uploading ? "上传中…" : "点击或拖入文件"}
        </span>
        <span className="text-tau-sm text-ink-3">PDF、Office、Markdown、音视频、图片</span>
      </label>
      {uploadedFiles.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {uploadedFiles.map((fileName, index) => (
            <div key={index} className="text-tau-meta text-ink-2 flex items-center gap-2 px-1 py-1">
              <Check className="text-ok size-4 shrink-0" strokeWidth={2} />
              <span className="truncate">{fileName}</span>
            </div>
          ))}
          <p className="text-tau-sm text-ink-3 m-0 mt-1 px-1">已加入资料，正在后台转换与索引</p>
        </div>
      )}
    </div>
  );

  const urlTab =
    processingStep === "done" ? (
      <StatusBlock tone="ok" text="剪藏完成" sub="已加入资料，正在后台索引" />
    ) : processingStep !== "idle" ? (
      <StatusBlock
        text={
          processingStep === "fetching"
            ? "正在获取网页…"
            : processingStep === "extracting"
              ? "正在提取正文…"
              : "正在保存…"
        }
      />
    ) : (
      <div className="flex flex-col gap-3.5">
        <FieldRow label="网页地址">
          <ResourceSelectInput
            data-autofocus
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            onKeyDown={e => e.key === "Enter" && handleClipUrl()}
          />
        </FieldRow>
        <FieldRow label="标题" hint="可选，留空从网页提取">
          <ResourceSelectInput
            value={resourceTitle}
            onChange={e => setResourceTitle(e.target.value)}
            placeholder="网页标题"
            onKeyDown={e => e.key === "Enter" && handleClipUrl()}
          />
        </FieldRow>
        {error && <ErrorNote title="剪藏失败" text={error} />}
      </div>
    );

  const videoTab =
    videoStep === "done" ? (
      <StatusBlock tone="ok" text="已加入资料" sub="视频正在后台下载与转录" />
    ) : videoStep === "adding" ? (
      <StatusBlock text="正在添加视频…" />
    ) : videoStep === "config" && videoInfo ? (
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          {videoInfo.cover && (
            <LocalImage
              url={videoInfo.cover}
              alt={videoInfo.title}
              className="rounded-tau-sm h-[54px] w-24 shrink-0 object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <div
              className="text-tau-body text-ink-1 truncate font-semibold"
              title={videoInfo.title}
            >
              {videoInfo.title}
            </div>
            <div className="text-tau-sm text-ink-3">{videoInfo.providerName}</div>
          </div>
        </div>
        {videoInfo.variants.length > 1 && (
          <FieldRow label="清晰度">
            <Select
              aria-label="清晰度"
              value={videoResolver.variant}
              onValueChange={v => videoResolver.setVariant(v)}
              options={videoInfo.variants.map((item, index) => ({
                value: index,
                label: item.hint ? `${item.label} · ${item.hint}` : item.label,
              }))}
            />
          </FieldRow>
        )}
        {videoError && <ErrorNote text={videoError} />}
      </div>
    ) : (
      <div className="flex flex-col gap-3.5">
        {videoProviders.length === 0 ? (
          <p className="text-tau-meta text-ink-2 m-0">
            在插件中心安装 Bilibili、YouTube 等视频来源后，可以从这里添加视频。
          </p>
        ) : (
          videoProviders.length > 1 && (
            <FieldRow label="来源">
              <Select
                aria-label="视频来源"
                value={activeVideoSource}
                onValueChange={value => {
                  setVideoSource(value);
                  videoResolver.setError(null);
                }}
                options={videoProviders.map(provider => ({
                  value: provider.id,
                  label: provider.name,
                }))}
              />
            </FieldRow>
          )
        )}
        <FieldRow label="视频链接">
          <ResourceSelectInput
            data-autofocus
            ref={videoInputRef}
            type="url"
            value={videoUrl}
            onChange={e => {
              setVideoUrl(e.target.value);
              videoResolver.setError(null);
            }}
            placeholder="粘贴视频链接"
            disabled={isAnalyzing || !activeVideoSource}
            onKeyDown={e => e.key === "Enter" && !isAnalyzing && handleAnalyzeVideo()}
          />
        </FieldRow>
        {videoError && <ErrorNote text={videoError} />}
      </div>
    );

  const noteTab = (
    <div className="flex flex-col items-center gap-3 px-6 py-6 text-center">
      <NotebookPen className="text-ink-2 size-5" strokeWidth={1.75} />
      <p className="text-tau-meta text-ink-2 m-0 max-w-[34ch] leading-relaxed">
        从卡片库、文章、项目文档和日记里挑已有的笔记加入资料，可以一次选多篇。
      </p>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          onClose();
          setPickerOpen(true);
        }}
      >
        选择笔记
      </Button>
    </div>
  );

  const footer = (() => {
    if (activeTab === "url" && processingStep === "idle")
      return (
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" disabled={!url.trim()} onClick={handleClipUrl}>
            开始剪藏
          </Button>
        </>
      );
    if (activeTab === "video" && videoStep === "input")
      return (
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={isAnalyzing}
            loadingText="正在解析…"
            disabled={!videoUrl.trim() || !activeVideoSource}
            onClick={handleAnalyzeVideo}
          >
            解析视频
          </Button>
        </>
      );
    if (activeTab === "video" && videoStep === "config")
      return (
        <>
          <Button variant="secondary" size="sm" onClick={handleVideoBack}>
            返回
          </Button>
          <Button variant="primary" size="sm" onClick={handleAddVideo}>
            加入资料
          </Button>
        </>
      );
    return (
      <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
        {uploadedFiles.length > 0 || processingStep === "done" || videoStep === "done"
          ? "完成"
          : "取消"}
      </Button>
    );
  })();

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={next => !next && onClose()}
        title="添加资料"
        icon={<Plus className="size-4" strokeWidth={1.75} />}
        width={540}
        locked={busy}
        footer={footer}
      >
        <DialogBody>
          {/* 隐藏的 Webview：加载需要执行脚本才能拿到正文的网页 */}
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
          <div className="flex flex-col gap-4">
            <Segmented
              label="资料来源"
              size="md"
              value={activeTab}
              onValueChange={v => setActiveTab(v as TabType)}
              disabled={busy}
            >
              <Segmented.Item value="file" icon={FileText} label="文件" />
              <Segmented.Item value="url" icon={Globe} label="网页" />
              <Segmented.Item value="video" icon={Clapperboard} label="视频" />
              <Segmented.Item value="note" icon={NotebookPen} label="笔记" />
            </Segmented>
            {activeTab === "file" && fileTab}
            {activeTab === "url" && urlTab}
            {activeTab === "video" && videoTab}
            {activeTab === "note" && noteTab}
          </div>
        </DialogBody>
      </Dialog>
      <EntityPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="把笔记加入资料"
        kinds={NOTE_KINDS}
        isLinked={c => c.contentId !== null && linkedContentIds.has(c.contentId)}
        confirmLabel="加入资料"
        onConfirm={async picked => {
          try {
            await handleAddNotes(picked);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "加入资料失败");
            throw err;
          }
        }}
      />
    </>
  );
});

AddResourceModal.displayName = "AddResourceModal";

/** 字段：12px 淡墨标签 + 可选提示，控件在下 */
function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2">
        <span className="text-ink-2 text-[12px]">{label}</span>
        {hint && <span className="text-ink-3 text-[11.5px]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/** 处理中 / 完成：居中一枚图标 + 一句话 */
function StatusBlock({ text, sub, tone }: { text: string; sub?: string; tone?: "ok" }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      {tone === "ok" ? (
        <span className="bg-ok-soft text-ok grid size-9 place-items-center rounded-full">
          <Check className="size-4" strokeWidth={2} />
        </span>
      ) : (
        <Spinner className="size-5" />
      )}
      <span className="text-tau-body text-ink-1 font-medium">{text}</span>
      {sub && <span className="text-tau-sm text-ink-3">{sub}</span>}
    </div>
  );
}

function ErrorNote({ title, text }: { title?: string; text: string }) {
  return (
    <div className="bg-danger-soft text-danger text-tau-meta rounded-tau-sm px-3.5 py-2.5">
      {title && <div className="font-medium">{title}</div>}
      <div className={cn(title && "text-danger/85 text-tau-sm mt-0.5")}>{text}</div>
    </div>
  );
}

export default AddResourceModal;
