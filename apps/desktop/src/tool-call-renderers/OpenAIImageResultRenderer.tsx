import { useState } from "react";
import type { ToolCallCustomRendererProps } from "./types";
import { OPENAI_IMAGE_RENDERER_KEY } from "@/tools/openaiImageTools";
import LocalImage from "@/components/LocalImage";
import LocalImagePreviewPortal from "@/components/LocalImagePreviewPortal";
import { Copy, Pencil, Check, ChevronDown } from "lucide-react";
import { useChatWidgetInteraction } from "./generative-widget/interaction-context";
import {
  ToolCard,
  ToolCardHeader,
  ToolCardBody,
  ToolMutedText,
  ToolSectionTitle,
  ToolBadge,
} from "./ui";

interface OpenAIImageRenderPayload {
  success: boolean;
  mode: "generate" | "edit";
  prompt: string;
  images: Array<{
    url: string;
    mimeType: string;
    fileName: string;
    revisedPrompt?: string;
  }>;
  parameters: Record<string, unknown>;
}

const getPayload = (
  metadata?: Record<string, unknown>,
): OpenAIImageRenderPayload | null => {
  const render =
    metadata?.render && typeof metadata.render === "object"
      ? (metadata.render as Record<string, unknown>)
      : null;
  if (!render || render.rendererKey !== OPENAI_IMAGE_RENDERER_KEY) {
    return null;
  }
  const payload =
    render.payload && typeof render.payload === "object"
      ? (render.payload as OpenAIImageRenderPayload)
      : null;
  if (!payload || !Array.isArray(payload.images)) {
    return null;
  }
  return payload;
};

const overlayBtnClass =
  "inline-flex h-7 w-7 items-center justify-center rounded-full backdrop-blur transition bg-black/50 text-white/90 hover:bg-black/70 hover:text-white";

const CopyButton = ({ url }: { url: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      title={copied ? "已复制" : "复制链接"}
      className={`${overlayBtnClass} ${copied ? "!text-emerald-400" : ""}`}
      onClick={handleCopy}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
};

const ImageCard = ({
  image,
  prompt,
  isDark,
  single,
  onPreview,
  onEdit,
}: {
  image: OpenAIImageRenderPayload["images"][number];
  prompt: string;
  isDark: boolean;
  single: boolean;
  onPreview: (image: OpenAIImageRenderPayload["images"][number]) => void;
  onEdit: (image: OpenAIImageRenderPayload["images"][number]) => void;
}) => (
  <div
    className={`group relative cursor-zoom-in overflow-hidden rounded-lg ${
      isDark ? "bg-zinc-950/40" : "bg-slate-50"
    }`}
    onClick={() => onPreview(image)}
  >
    <LocalImage
      url={image.url}
      alt={image.revisedPrompt || prompt}
      className="h-auto w-full object-contain"
      style={{ maxHeight: single ? "480px" : "320px" }}
    />
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-end gap-1.5 p-2.5 opacity-0 transition-opacity group-hover:opacity-100">
      <div className="pointer-events-auto flex gap-1.5">
        <button
          type="button"
          title="编辑"
          className={overlayBtnClass}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(image);
          }}
        >
          <Pencil size={14} />
        </button>
        <CopyButton url={image.url} />
      </div>
    </div>
  </div>
);

const buildHiddenEditContext = (
  image: OpenAIImageRenderPayload["images"][number],
  prompt: string,
) =>
  `请调用 edit_image 工具基于这张图片继续编辑：${image.url}\n\n原始生成提示：${prompt}`;

const OpenAIImageResultRenderer = ({
  execution,
  isDark,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const interaction = useChatWidgetInteraction();
  const [previewImage, setPreviewImage] = useState<
    OpenAIImageRenderPayload["images"][number] | null
  >(null);
  const [expanded, setExpanded] = useState(execution.status !== "success");
  const payload = getPayload(execution.metadata);
  if (!payload) {
    return renderDefault();
  }

  const single = payload.images.length === 1;
  const title = payload.mode === "edit" ? "图片编辑完成" : "图片生成完成";

  const handleEdit = (image: OpenAIImageRenderPayload["images"][number]) => {
    interaction?.setHiddenPromptContext?.({
      text: buildHiddenEditContext(image, payload.prompt),
      label: "输入编辑要求，例如：去掉文字、改为透明背景",
    });
    interaction?.setInputValue?.("");
  };

  return (
    <>
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark} divided>
          <ToolSectionTitle
            isDark={isDark}
            action={
              <div className="flex items-center gap-1.5">
                {!single ? (
                  <ToolBadge isDark={isDark}>
                    {payload.images.length} 张图片
                  </ToolBadge>
                ) : null}
                <button
                  type="button"
                  title={expanded ? "收起" : "展开"}
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                    isDark
                      ? "text-slate-400 hover:bg-white/10 hover:text-slate-200"
                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  }`}
                  onClick={() => setExpanded((v) => !v)}
                >
                  <ChevronDown
                    size={15}
                    className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
            }
          >
            {title}
          </ToolSectionTitle>
          <ToolMutedText isDark={isDark} className="mt-1 line-clamp-2">
            {payload.prompt}
          </ToolMutedText>
        </ToolCardHeader>
        {expanded ? (
          <ToolCardBody>
            <div
              className={single ? "" : "grid grid-cols-1 gap-4 sm:grid-cols-2"}
            >
              {payload.images.map((image, index) => (
                <ImageCard
                  key={`${image.url}-${index}`}
                  image={image}
                  prompt={payload.prompt}
                  isDark={isDark}
                  single={single}
                  onPreview={setPreviewImage}
                  onEdit={handleEdit}
                />
              ))}
            </div>
          </ToolCardBody>
        ) : null}
      </ToolCard>

      {previewImage ? (
        <LocalImagePreviewPortal
          url={previewImage.url}
          alt={previewImage.revisedPrompt || payload.prompt}
          onClose={() => setPreviewImage(null)}
        />
      ) : null}
    </>
  );
};

export default OpenAIImageResultRenderer;
