import { useState } from "react";
import type { ToolCallCustomRendererProps } from "./types";
import { OPENAI_IMAGE_RENDERER_KEY } from "@/tools/openaiImageTools";
import LocalImage from "@/components/LocalImage";
import LocalImagePreviewPortal from "@/components/LocalImagePreviewPortal";
import { Copy, Pencil, Check, ChevronDown } from "lucide-react";
import { IconButton, cn } from "@tau/ui";
import { useToolRendererInteraction } from "./ToolRendererInteractionContext";
import {
  ToolCard,
  ToolCardHeader,
  ToolCardBody,
  ToolMutedText,
  ToolSectionTitle,
  ToolBadge,
} from "@tau/chat-ui";

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

const getPayload = (metadata?: Record<string, unknown>): OpenAIImageRenderPayload | null => {
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

/** 图上浮层按钮：surface 半透亮底 + line-1 描边（浮起物口径），随主题切换 */
const overlayBtnClass =
  "border-line-1 bg-surface/90 text-ink-2 hover:bg-surface-hover hover:text-ink-1 ease-tau-out inline-flex size-7 cursor-pointer items-center justify-center rounded-tau-sm border backdrop-blur transition-colors duration-[140ms]";

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
      className={cn(overlayBtnClass, copied && "text-ok hover:text-ok")}
      onClick={handleCopy}
    >
      {copied ? <Check size={14} strokeWidth={1.75} /> : <Copy size={14} strokeWidth={1.75} />}
    </button>
  );
};

const ImageCard = ({
  image,
  prompt,
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
    className="bg-hover rounded-tau-sm group relative cursor-zoom-in overflow-hidden"
    onClick={() => onPreview(image)}
  >
    <LocalImage
      url={image.url}
      alt={image.revisedPrompt || prompt}
      className="h-auto w-full object-contain"
      style={{ maxHeight: single ? "480px" : "320px" }}
    />
    <div className="ease-tau-out pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-end gap-1.5 p-2.5 opacity-0 transition-opacity duration-[160ms] group-hover:opacity-100">
      <div className="pointer-events-auto flex gap-1.5">
        <button
          type="button"
          title="编辑"
          className={overlayBtnClass}
          onClick={e => {
            e.stopPropagation();
            onEdit(image);
          }}
        >
          <Pencil size={14} strokeWidth={1.75} />
        </button>
        <CopyButton url={image.url} />
      </div>
    </div>
  </div>
);

const buildHiddenEditContext = (
  image: OpenAIImageRenderPayload["images"][number],
  prompt: string
) => `请调用 edit_image 工具基于这张图片继续编辑：${image.url}\n\n原始生成提示：${prompt}`;

const OpenAIImageResultRenderer = ({
  execution,
  isDark,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const interaction = useToolRendererInteraction();
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
        <ToolCardHeader isDark={isDark}>
          <ToolSectionTitle
            isDark={isDark}
            action={
              <div className="flex items-center gap-1.5">
                {!single ? (
                  <ToolBadge isDark={isDark}>{payload.images.length} 张图片</ToolBadge>
                ) : null}
                <IconButton
                  className="size-[26px]"
                  title={expanded ? "收起" : "展开"}
                  aria-label={expanded ? "收起" : "展开"}
                  aria-expanded={expanded}
                  onClick={() => setExpanded(v => !v)}
                >
                  <ChevronDown
                    size={15}
                    strokeWidth={1.75}
                    className={cn(
                      "ease-tau-out transition-transform duration-[160ms]",
                      expanded && "rotate-180"
                    )}
                  />
                </IconButton>
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
            <div className={single ? "" : "grid grid-cols-1 gap-3 sm:grid-cols-2"}>
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
