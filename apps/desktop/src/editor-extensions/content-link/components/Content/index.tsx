import { contentLinkTranslator, useContentLinkI18n } from "../../i18n";
import { formatRecentDateTime } from "@/features/shared/list/format";
import { lazy, memo, Suspense, type ReactNode } from "react";
import {
  ArrowUpRight,
  FileText,
  FolderKanban,
  Layers,
  Lock,
  Puzzle,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import { AnchoredPanel, Button, PanelHasHeaderContext, Spinner, cn } from "@tau/ui";
import { useEntityKindMeta, type KindIcon } from "@/components/EntityKind";
import { IContent } from "@/types";

const Editor = lazy(() => import("@/components/ContentEditor"));

const TYPE_META: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  card: {
    get label() {
      return contentLinkTranslator.t("type.card");
    },
    icon: Layers,
    tone: "bg-ok-soft text-ok",
  },
  article: {
    get label() {
      return contentLinkTranslator.t("type.article");
    },
    icon: FileText,
    tone: "bg-info-soft text-info",
  },
  "project-item": {
    get label() {
      return contentLinkTranslator.t("type.project-item");
    },
    icon: FolderKanban,
    tone: "bg-tag-4-soft text-tag-4",
  },
  "plugin-entity": {
    get label() {
      return contentLinkTranslator.t("type.plugin-entity");
    },
    icon: Puzzle,
    tone: "bg-tag-5-soft text-tag-5",
  },
};
const FALLBACK_META = {
  get label() {
    return contentLinkTranslator.t("type.content");
  },
  icon: FileText,
  tone: "bg-hover text-ink-2",
};

interface IContentProps {
  /** undefined = 载入中，null = 不存在或已删除 */
  content:
    | (Pick<IContent, "content" | "count" | "updateTime" | "contracts"> & { id: string | number })
    | null
    | undefined;
  contentType: string;
  refId?: number;
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
  icon: KindIcon;
  tone: string;
  title: string;
  meta: ReactNode;
}) => (
  <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-1">
    <span className={cn("rounded-tau-sm grid size-7 shrink-0 place-items-center", tone)}>
      <Icon className="size-[15px]" strokeWidth={1.75} />
    </span>
    <div className="min-w-0">
      <div className="text-tau-title text-ink-1 truncate leading-tight font-semibold">{title}</div>
      <div className="text-tau-micro text-ink-3 mt-0.5 truncate">{meta}</div>
    </div>
  </div>
);

const Content = memo((props: IContentProps) => {
  const { t, locale } = useContentLinkI18n();
  const { content, contentType, refId, contentTitle, unshared, onOpen, onRemove } = props;
  const baseMeta = TYPE_META[contentType] ?? FALLBACK_META;
  // 插件内容按插件声明的类型名与图标显示，色调沿用通用的插件内容
  const typeMeta = {
    ...baseMeta,
    ...useEntityKindMeta(
      refId === undefined ? undefined : { kind: contentType, id: refId },
      baseMeta
    ),
  };
  const title = contentTitle || `${typeMeta.label} #${content?.id ?? ""}`.trim();

  if (unshared) {
    return <Header icon={Lock} tone="bg-warn-soft text-warn" title={title} meta={t("local")} />;
  }

  if (content === undefined) {
    return <Header icon={typeMeta.icon} tone={typeMeta.tone} title={title} meta={t("loading")} />;
  }

  if (content === null) {
    return (
      <div className="pb-3">
        <Header icon={Unlink} tone="bg-hover text-ink-3" title={t("invalid")} meta={t("deleted")} />
        {onRemove && (
          <div className="flex justify-end px-3 pt-1">
            <Button variant="ghost" size="sm" onClick={onRemove}>
              {t("remove")}
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
        meta={t("meta", {
          type: typeMeta.label,
          date: formatRecentDateTime(content.updateTime, locale, (day, time) => `${day} ${time}`),
        })}
      />
      <AnchoredPanel.Body className="max-h-[260px]">
        <Suspense fallback={<Spinner />}>
          <Editor
            key={content.id}
            initValue={content.content}
            contracts={content.contracts}
            readonly
          />
        </Suspense>
      </AnchoredPanel.Body>
      <AnchoredPanel.Footer className="justify-between py-2 pr-2.5 pl-4">
        <span className="text-tau-micro text-ink-3">
          {content.count > 0
            ? t("words", { count: content.count, amount: content.count.toLocaleString(locale) })
            : ""}
        </span>
        <Button variant="ghost" size="sm" icon={ArrowUpRight} onClick={onOpen}>
          {t("open")}
        </Button>
      </AnchoredPanel.Footer>
    </PanelHasHeaderContext.Provider>
  );
});

export default Content;
