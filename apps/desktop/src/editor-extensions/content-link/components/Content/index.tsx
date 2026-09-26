import { memo, type ReactNode } from "react";
import {
  ArrowUpRight,
  FileText,
  FolderKanban,
  Layers,
  Lock,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import { AnchoredPanel, Button, PanelHasHeaderContext, cn } from "@tau/ui";
import Editor from "@/components/ContentEditor";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import { formatAgo } from "@/utils/formatAgo";
import { IContent } from "@/types";

const TYPE_META: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  card: { label: "卡片", icon: Layers, tone: "bg-ok-soft text-ok" },
  article: { label: "文章", icon: FileText, tone: "bg-info-soft text-info" },
  "project-item": { label: "项目文档", icon: FolderKanban, tone: "bg-tag-4-soft text-tag-4" },
};
const FALLBACK_META = { label: "内容", icon: FileText, tone: "bg-hover text-ink-2" };

interface IContentProps {
  /** undefined = 载入中，null = 不存在或已删除 */
  content: IContent | null | undefined;
  contentType: string;
  contentTitle: string;
  /** 协作者视角：被引用内容只在创建者本机 */
  unshared: boolean;
  onOpen: () => void;
  /** 仅可编辑时提供：失效链接就地移除 */
  onRemove?: () => void;
}

const Header = ({
  icon: Icon,
  tone,
  title,
  meta,
}: {
  icon: LucideIcon;
  tone: string;
  title: string;
  meta: ReactNode;
}) => (
  <div className="flex items-center gap-2.5 px-4 pb-1 pt-3.5">
    <span className={cn("rounded-tau-sm grid size-7 shrink-0 place-items-center", tone)}>
      <Icon className="size-[15px]" strokeWidth={1.75} />
    </span>
    <div className="min-w-0">
      <div className="text-tau-title text-ink-1 truncate font-semibold leading-tight">{title}</div>
      <div className="text-tau-micro text-ink-3 mt-0.5 truncate">{meta}</div>
    </div>
  </div>
);

const Content = memo((props: IContentProps) => {
  const { content, contentType, contentTitle, unshared, onOpen, onRemove } = props;
  const extensions = useDynamicExtensionsStore(state => state.extensions);
  const typeMeta = TYPE_META[contentType] ?? FALLBACK_META;
  const title = contentTitle || `${typeMeta.label} #${content?.id ?? ""}`.trim();

  if (unshared) {
    return (
      <Header
        icon={Lock}
        tone="bg-warn-soft text-warn"
        title={title}
        meta="内容未共享，仅保存在创建者本机"
      />
    );
  }

  if (content === undefined) {
    return <Header icon={typeMeta.icon} tone={typeMeta.tone} title={title} meta="正在载入…" />;
  }

  if (content === null) {
    return (
      <div className="pb-3">
        <Header
          icon={Unlink}
          tone="bg-hover text-ink-3"
          title="链接已失效"
          meta="引用的内容不存在或已被删除"
        />
        {onRemove && (
          <div className="flex justify-end px-3 pt-1">
            <Button variant="ghost" size="sm" onClick={onRemove}>
              移除链接
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <PanelHasHeaderContext.Provider value>
      <Header
        icon={typeMeta.icon}
        tone={typeMeta.tone}
        title={title}
        meta={`${typeMeta.label} · ${formatAgo(content.updateTime)}编辑`}
      />
      <AnchoredPanel.Body className="max-h-[260px]">
        <Editor key={content.id} initValue={content.content} readonly extensions={extensions} />
      </AnchoredPanel.Body>
      <AnchoredPanel.Footer className="justify-between py-2 pl-4 pr-2.5">
        <span className="text-tau-micro text-ink-3">
          {content.count > 0 ? `约 ${content.count} 字` : ""}
        </span>
        <Button variant="ghost" size="sm" icon={ArrowUpRight} onClick={onOpen}>
          打开
        </Button>
      </AnchoredPanel.Footer>
    </PanelHasHeaderContext.Provider>
  );
});

export default Content;
