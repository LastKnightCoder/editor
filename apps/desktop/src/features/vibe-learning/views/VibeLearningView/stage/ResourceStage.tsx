/**
 * 阅读区 · 资料：按类型呈现——音视频（带字幕跟读）、网页、图片、笔记（可编辑）、
 * 文档（转换后的文本）。底部一行「基于这份资料」直接起生成，只预选当前这份。
 */

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, MoreHorizontal } from "lucide-react";
import type { Descendant } from "slate";
import { Button, IconButton, Menu, Tooltip, toast } from "@tau/ui";

import Editor from "@/components/ContentEditor";
import { ErrorBoundary } from "@tau/ui";
import LocalImage from "@/components/LocalImage";
import { FadeScroll } from "@tau/ui";
import { getContentById } from "@/commands";
import type { NoteSourceMeta, VLResource } from "@/types/vibe-learning";

import VideoPreview from "../ResourcePreview/VideoPreview";
import AudioPreview from "../ResourcePreview/AudioPreview";
import HtmlPreview from "../ResourcePreview/HtmlPreview";
import { GENERATE_APPS, type GenerateAppKey } from "../appMeta";
import { isDocument, openResourceExternally, resourceIcon } from "../resourceKinds";
import { MarkdownReader } from "./MarkdownReader";
import { StageHeader } from "@/components/StageHeader";

const TYPE_LABEL: Record<string, string> = {
  pdf: "PDF",
  doc: "Word",
  docx: "Word",
  ppt: "PPT",
  pptx: "PPT",
  xls: "Excel",
  xlsx: "Excel",
  txt: "文本",
  md: "Markdown",
  audio: "音频",
  video: "视频",
  image: "图片",
  html: "网页",
  other: "文件",
};

const SOURCE_LABEL: Record<string, string> = {
  bilibili: "B 站",
  youtube: "YouTube",
  remote: "网页链接",
  note: "来自笔记",
  material: "来自摘录",
};

function metaOf(resource: VLResource) {
  const parts = [
    (resource.sourceType && SOURCE_LABEL[resource.sourceType]) || TYPE_LABEL[resource.resourceType],
  ];
  if (isDocument(resource)) parts.push("转换后的文本");
  return parts.filter(Boolean).join(" · ");
}

/** 快捷生成：前 4 个常用应用直接给按钮，其余收进更多 */
const QUICK: GenerateAppKey[] = ["outline", "highlights", "mindmap", "quiz"];

function QuickGenerate({ onGenerate }: { onGenerate: (key: GenerateAppKey) => void }) {
  const quick = GENERATE_APPS.filter(a => QUICK.includes(a.key));
  const rest = GENERATE_APPS.filter(a => !QUICK.includes(a.key));
  return (
    <div className="flex shrink-0 items-center justify-center gap-1 px-4 pb-3 pt-2">
      <span className="text-tau-sm text-ink-3 mr-1 whitespace-nowrap">基于这份资料</span>
      {quick.map(app => (
        <Button
          key={app.key}
          variant="ghost"
          size="sm"
          icon={app.icon}
          onClick={() => onGenerate(app.key)}
        >
          {app.label}
        </Button>
      ))}
      <Menu
        align="end"
        trigger={
          <IconButton className="size-[28px]" aria-label="更多生成">
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </IconButton>
        }
      >
        {rest.map(app => (
          <Menu.Item
            key={app.key}
            icon={<app.icon className="size-4" strokeWidth={1.75} />}
            onSelect={() => onGenerate(app.key)}
          >
            {app.label}
          </Menu.Item>
        ))}
      </Menu>
    </div>
  );
}

/** 来自笔记的资料：就地编辑原笔记（实时保存） */
function NoteResourceBody({ meta }: { meta: NoteSourceMeta }) {
  const [content, setContent] = useState<Descendant[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setContent(null);
    getContentById(meta.contentId)
      .then(data => data && setContent(data.content))
      .catch(err => {
        console.error("Failed to load note content:", err);
        toast.error("加载笔记内容失败");
      })
      .finally(() => setLoading(false));
  }, [meta.contentId]);

  if (loading)
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="text-ink-3 size-5 animate-spin" strokeWidth={1.75} />
      </div>
    );
  if (!content)
    return (
      <div className="text-tau-meta text-ink-3 flex flex-1 items-center justify-center">
        原笔记已不存在
      </div>
    );
  return (
    <FadeScroll className="min-h-0 flex-1">
      <div className="mx-auto max-w-[760px] px-10 pb-16 pt-2">
        <ErrorBoundary>
          <Editor
            key={meta.contentId}
            contentId={meta.contentId}
            initValue={content}
            readonly={false}
            onChange={next => {
              setContent(next);
            }}
            editingContext={{ entityType: "vl-resource", entityId: meta.originalId }}
          />
        </ErrorBoundary>
      </div>
    </FadeScroll>
  );
}

function parseNoteMeta(resource: VLResource): NoteSourceMeta | null {
  if (resource.sourceType !== "note" || !resource.sourceMetaInfo) return null;
  try {
    return JSON.parse(resource.sourceMetaInfo) as NoteSourceMeta;
  } catch {
    return null;
  }
}

interface ResourceStageProps {
  resource: VLResource;
  projectId: number;
  mainDbName: string;
  chatOpen: boolean;
  onToggleChat: () => void;
  onClose: () => void;
  onGenerate: (key: GenerateAppKey, resourceId: number) => void;
}

export function ResourceStage(props: ResourceStageProps) {
  const { resource, projectId, mainDbName } = props;
  const Icon = resourceIcon(resource);
  const noteMeta = parseNoteMeta(resource);

  const body = (() => {
    if (resource.sourceType === "note")
      return noteMeta ? (
        <NoteResourceBody meta={noteMeta} />
      ) : (
        <div className="text-tau-meta text-ink-3 flex flex-1 items-center justify-center">
          无法解析笔记信息
        </div>
      );
    switch (resource.resourceType) {
      case "video":
        return (
          <div className="min-h-0 flex-1">
            <VideoPreview resource={resource} />
          </div>
        );
      case "audio":
        return (
          <div className="min-h-0 flex-1">
            <AudioPreview resource={resource} />
          </div>
        );
      case "html":
        return (
          <div className="rounded-tau-md mx-4 mb-2 min-h-0 flex-1 overflow-hidden">
            <HtmlPreview resource={resource} />
          </div>
        );
      case "image":
        return (
          <div className="flex min-h-0 flex-1 items-center justify-center px-8 pb-6">
            <LocalImage
              url={resource.originalPath}
              alt={resource.name}
              className="rounded-tau-md max-h-full max-w-full object-contain"
            />
          </div>
        );
      default:
        return <MarkdownReader resource={resource} projectId={projectId} mainDbName={mainDbName} />;
    }
  })();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <StageHeader
        icon={<Icon className="size-4" strokeWidth={1.75} />}
        title={resource.name}
        meta={metaOf(resource)}
        chatOpen={props.chatOpen}
        onToggleChat={props.onToggleChat}
        onClose={props.onClose}
        actions={
          isDocument(resource) && (
            <Tooltip content="用默认程序打开原件" placement="bottom">
              <IconButton
                aria-label="用默认程序打开原件"
                onClick={() => void openResourceExternally(resource)}
              >
                <ExternalLink className="size-4" strokeWidth={1.75} />
              </IconButton>
            </Tooltip>
          )
        }
      />
      {body}
      {resource.markdownPath && (
        <QuickGenerate onGenerate={key => props.onGenerate(key, resource.id)} />
      )}
    </div>
  );
}
