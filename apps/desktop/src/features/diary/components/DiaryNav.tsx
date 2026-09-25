/**
 * 侧栏「日记」入口的子项（D-044，协作页 A3 同款侧栏嵌套）：标签即频道。
 * 日记页在栈顶时于入口下方展开：各标签（按使用次数排）+ 无标签；点击经页面参数 id
 * 切到该频道（`tag:<名>` / `untagged`），再点当前项回到全部。右键标签改色 / 清理。
 * 页内因此不再放标签栏——全局只剩一条侧栏（PREFERENCES「页内不再放第二条侧栏」）。
 */

import { useMemo, useState } from "react";
import { Eraser, Hash } from "lucide-react";
import { ContextMenu, Menu, cn, toast, TAG_COLORS } from "@tau/ui";
import { COLOR_LABEL, parseScope, rankTags, scopeId, tagCounts, type DiaryScope } from "../model";
import { useDiaryMutations, useDiarySnapshot } from "../queries";
import { TagDot } from "./bits";
import { ClearTagDialog } from "./TagPicker";

export function DiaryNavTags({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const { snapshot } = useDiarySnapshot();
  const mutations = useDiaryMutations();
  const [clearing, setClearing] = useState<string | null>(null);
  const counts = useMemo(() => tagCounts(snapshot?.moments ?? []), [snapshot]);
  const tags = useMemo(() => rankTags(snapshot?.tags ?? [], counts), [snapshot, counts]);
  if (!snapshot) return null;
  const current = parseScope(selectedId);
  const untagged = snapshot.moments.filter(m => !m.tags.length).length;
  const select = (scope: DiaryScope) =>
    onSelect(scopeId(scope) === scopeId(current) ? "" : scopeId(scope));

  return (
    <div className="mb-1 mt-0.5 space-y-px" role="group" aria-label="日记标签">
      {tags.map(tag => (
        <ContextMenu
          key={tag.name}
          content={
            <>
              <Menu.Group>颜色</Menu.Group>
              <Menu.RadioGroup
                value={tag.color}
                onValueChange={color =>
                  void mutations.recolor(tag.name, color as (typeof TAG_COLORS)[number])
                }
              >
                {TAG_COLORS.map(color => (
                  <Menu.RadioItem key={color} value={color} icon={<TagDot color={color} />}>
                    {COLOR_LABEL[color]}
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
              <Menu.Separator />
              <Menu.Item
                danger
                icon={<Eraser className="size-[15px]" strokeWidth={1.75} />}
                onSelect={() => setClearing(tag.name)}
              >
                清理这个标签…
              </Menu.Item>
            </>
          }
        >
          <NavChild
            active={current.kind === "tag" && current.tag === tag.name}
            label={tag.name}
            count={counts.get(tag.name) ?? 0}
            glyph={<TagDot color={tag.color} className="size-[7px]" />}
            onClick={() => select({ kind: "tag", tag: tag.name })}
          />
        </ContextMenu>
      ))}
      {untagged > 0 && (
        <NavChild
          active={current.kind === "untagged"}
          label="无标签"
          count={untagged}
          glyph={<Hash className="text-ink-3 size-[13px]" strokeWidth={1.75} />}
          onClick={() => select({ kind: "untagged" })}
        />
      )}
      <ClearTagDialog
        name={clearing}
        count={clearing ? (counts.get(clearing) ?? 0) : 0}
        onOpenChange={open => !open && setClearing(null)}
        onConfirm={async name => {
          await mutations.clearTag(name);
          if (current.kind === "tag" && current.tag === name) onSelect("");
          toast.success(`已清理标签「${name}」`);
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
  return (
    // 让出父项图标列（按 body 字号折算）放在按钮外：高亮只盖色点起的一段，色点落在父项文字列
    <div className="flex gap-2.5">
      <span aria-hidden className="text-tau-body w-[1.06em] shrink-0" />
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        title={active ? "再点一次回到全部" : `只看「${label}」`}
        className={cn(
          "text-tau-meta ease-tau-out flex h-[calc(1.5em+10px)] min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-2.5 text-left transition-[background,color] duration-[160ms]",
          // 子项选中 = 当前频道：accent 淡底（父项此时降为「所在区」样式，同协作页）
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
