/**
 * 漫步偏好选择器：范围（哪几类内容进抽样池）与抽取偏好（纯随机 / 久未见 / 那年今日）。
 * 改偏好只影响下一次随机跳转，不重置当前内容；变更即持久化。
 */

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button, FilterPill, Popover, Segmented } from "@tau/ui";
import type { WalkBias, WalkRefKind } from "@/types";
import { WALK_KIND_META, WALK_KIND_ORDER } from "../model";
import type { WalkPrefs } from "../prefs";

const BIAS_LABEL: Record<WalkBias, string> = {
  random: "纯随机",
  stale: "久未见",
  "on-this-day": "那年今日",
};

const BIAS_HINT: Record<WalkBias, string> = {
  random: "每条内容被抽到的机会均等",
  stale: "越久没见的内容，越容易被抽到",
  "on-this-day": "优先抽往年今天写下的内容，没有时按久未见",
};

function rangeLabel(kinds: WalkRefKind[]): string {
  if (kinds.length >= WALK_KIND_ORDER.length) return "全部内容";
  if (kinds.length <= 2) return kinds.map(kind => WALK_KIND_META[kind].label).join("、");
  return `${kinds.length} 类内容`;
}

export function WalkPoolPicker({
  prefs,
  onChange,
}: {
  prefs: WalkPrefs;
  onChange(prefs: WalkPrefs): void;
}) {
  const [open, setOpen] = useState(false);

  const toggleKind = (kind: WalkRefKind) => {
    const active = prefs.kinds.includes(kind);
    // 至少保留 1 个：取消最后一个时无效
    if (active && prefs.kinds.length === 1) return;
    const kinds = active
      ? prefs.kinds.filter(item => item !== kind)
      : WALK_KIND_ORDER.filter(item => prefs.kinds.includes(item) || item === kind);
    onChange({ ...prefs, kinds });
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-end"
      className="flex w-[300px] flex-col gap-3.5 p-3.5"
      trigger={
        <Button variant="ghost" size="sm" icon={SlidersHorizontal}>
          {rangeLabel(prefs.kinds)} · {BIAS_LABEL[prefs.bias]}
        </Button>
      }
    >
      <div>
        <p className="text-tau-micro text-ink-3 mb-1.5">从哪些内容里抽</p>
        <div className="flex flex-wrap gap-1.5">
          {WALK_KIND_ORDER.map(kind => (
            <FilterPill
              key={kind}
              active={prefs.kinds.includes(kind)}
              label={WALK_KIND_META[kind].label}
              onClick={() => toggleKind(kind)}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="text-tau-micro text-ink-3 mb-1.5">抽取偏好</p>
        <Segmented
          label="抽取偏好"
          value={prefs.bias}
          onValueChange={bias => onChange({ ...prefs, bias })}
        >
          <Segmented.Item value="random" label="纯随机" />
          <Segmented.Item value="stale" label="久未见" />
          <Segmented.Item value="on-this-day" label="那年今日" />
        </Segmented>
        <p className="text-tau-micro text-ink-3 mt-1.5">{BIAS_HINT[prefs.bias]}</p>
      </div>
    </Popover>
  );
}
