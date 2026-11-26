/**
 * 侧栏「白板」入口的子项（日记同款侧栏嵌套）：各标签（按使用次数排）+ 无标签。
 * 白板页在栈顶时于入口下方展开，点击经页面参数 id 收窄到该标签（`tag:<名>` / `untagged`），
 * 再点当前项回到全部。右键标签可清理（从所有白板上摘掉）。页内因此不放标签栏。
 */

import { useWhiteboardI18n, whiteboardTranslator } from "../i18n";
import { useMemo, useState } from "react";
import { CircleDashed, Eraser, Hash } from "lucide-react";
import { ConfirmDialog, ContextMenu, Menu, cn, toast } from "@tau/ui";
import { parseScope, rankTags, scopeId, untaggedCount, type WhiteboardScope } from "../model";
import { useWhiteboardMutations, useWhiteboards } from "../queries";

export function WhiteboardNavTags({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useWhiteboardI18n();
  const { items } = useWhiteboards();
  const mutations = useWhiteboardMutations();
  const [clearing, setClearing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tags = useMemo(() => rankTags(items ?? []), [items]);
  if (!items) return null;
  const current = parseScope(selectedId);
  const untagged = untaggedCount(items);
  const select = (scope: WhiteboardScope) =>
    onSelect(scopeId(scope) === scopeId(current) ? "" : scopeId(scope));

  return (
    <div className="mt-0.5 mb-1 space-y-px" role="group" aria-label={t("tags.group")}>
      {tags.map(tag => (
        <ContextMenu
          key={tag.name}
          content={
            <Menu.Item
              danger
              icon={<Eraser className="size-[15px]" strokeWidth={1.75} />}
              onSelect={() => setClearing(tag.name)}
            >
              {t("tags.clearMenu")}
            </Menu.Item>
          }
        >
          <NavChild
            active={current.kind === "tag" && current.tag === tag.name}
            label={tag.name}
            count={tag.count}
            glyph={<Hash className="text-ink-3 size-[13px]" strokeWidth={1.75} />}
            onClick={() => select({ kind: "tag", tag: tag.name })}
          />
        </ContextMenu>
      ))}
      {untagged > 0 && (
        <NavChild
          active={current.kind === "untagged"}
          label={t("tags.untagged")}
          count={untagged}
          glyph={<CircleDashed className="text-ink-3 size-[13px]" strokeWidth={1.75} />}
          onClick={() => select({ kind: "untagged" })}
        />
      )}
      <ConfirmDialog
        open={clearing !== null}
        onOpenChange={open => !open && setClearing(null)}
        title={t("tags.clear")}
        context={clearing ?? undefined}
        description={t("tags.clearDescription")}
        impact={t("tags.clearImpact", {
          count: tags.find(tag => tag.name === clearing)?.count ?? 0,
        })}
        danger
        confirmText={t("tags.clearConfirm")}
        loading={busy}
        onConfirm={async () => {
          if (!clearing) return;
          setBusy(true);
          try {
            await mutations.clearTag(clearing, items);
            if (current.kind === "tag" && current.tag === clearing) onSelect("");
            toast.success(whiteboardTranslator.t("tags.cleared", { tag: clearing }));
            setClearing(null);
          } catch {
            toast.error(whiteboardTranslator.t("tags.clearFailed"));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function NavChild({
  active,
  label,
  count,
  glyph,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  glyph: React.ReactNode;
  onClick: () => void;
}) {
  const { t } = useWhiteboardI18n();
  return (
    // 让出父项图标列（按 body 字号折算）放在按钮外：高亮只盖图标起的一段，图标落在父项文字列
    <div className="flex gap-2.5">
      <span aria-hidden className="text-tau-body w-[1.06em] shrink-0" />
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        title={active ? t("tags.backAll") : t("tags.only", { tag: label })}
        className={cn(
          "text-tau-meta ease-tau-out flex h-[calc(1.5em+10px)] min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-2.5 text-left transition-[background,color] duration-[160ms]",
          active
            ? "bg-selected text-ink-1 font-medium"
            : "text-ink-2 hover:bg-hover hover:text-ink-1"
        )}
      >
        <span className="grid w-[13px] shrink-0 place-items-center">{glyph}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-tau-tiny text-ink-3 font-normal tabular-nums">{count}</span>
      </button>
    </div>
  );
}
