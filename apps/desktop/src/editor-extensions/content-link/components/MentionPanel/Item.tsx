import { memo, useEffect, useMemo, useRef, type ReactNode } from "react";
import { FileText, FolderOpen, Newspaper, Puzzle, StickyNote } from "lucide-react";
import { usePluginEntityMetaResolver, type KindMeta } from "@/components/EntityKind";
import { SearchResult } from "@/types";
import { richTextPlainText } from "@tau/shared/rich-text-text";
import { ComposerPanelItem } from "@tau/shared";

interface IItemProps {
  item: SearchResult;
  query: string;
  active: boolean;
  onHover?: () => void;
  onClick?: () => void;
}

const TYPE_META: Record<string, KindMeta> = {
  card: { label: "卡片", icon: StickyNote },
  article: { label: "文章", icon: Newspaper },
  "project-item": { label: "项目文档", icon: FolderOpen },
  "plugin-entity": { label: "插件内容", icon: Puzzle },
};

/** 命中字 accent 标出（大小写不敏感，只标第一处） */
function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span className="text-accent-text">{text.slice(at, at + q.length)}</span>
      {text.slice(at + q.length)}
    </>
  );
}

const Item = memo((props: IItemProps) => {
  const { item, query, active, onHover, onClick } = props;
  const ref = useRef<HTMLDivElement>(null);
  // 插件内容按插件声明的类型名与图标显示
  const { label, icon: Icon } = usePluginEntityMetaResolver()(
    item.pluginEntity,
    TYPE_META[item.type] ?? { label: item.type, icon: FileText }
  );

  const plain = useMemo(() => richTextPlainText(item.content), [item.content]);
  const title = item.title?.trim() || plain.slice(0, 40) || "无标题";
  const snippet = item.title?.trim() ? plain.slice(0, 80) : "";

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <ComposerPanelItem
      ref={ref}
      icon={<Icon />}
      label={highlight(title, query)}
      description={
        <>
          <span className="text-ink-2">{label}</span>
          {snippet && <span> · {snippet}</span>}
        </>
      }
      active={active}
      onHover={onHover}
      onSelect={onClick}
    />
  );
});

export default Item;
