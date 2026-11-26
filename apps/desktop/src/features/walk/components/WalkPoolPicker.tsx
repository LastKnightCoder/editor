import { useWalkI18n } from "../i18n";
import type { WalkLocale, WalkMessageKey } from "../messages";
/**
 * 漫步偏好选择器：范围（哪几类内容进抽样池）与抽取偏好（纯随机 / 久未见 / 那年今日）。
 * 改偏好只影响下一次随机跳转，不重置当前内容；变更即持久化。
 */

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button, FilterPill, Popover, Segmented } from "@tau/ui";
import type { WalkBias, WalkRefKind } from "@/types";
import { walkKindMeta, WALK_KIND_ORDER } from "../model";
import type { WalkPrefs } from "../prefs";

const BIAS_MESSAGE: Record<WalkBias, WalkMessageKey> = {
  random: "pool.bias.random",
  stale: "pool.bias.stale",
  "on-this-day": "pool.bias.on-this-day",
};

const BIAS_HINT: Record<WalkBias, WalkMessageKey> = {
  random: "pool.hint.random",
  stale: "pool.hint.stale",
  "on-this-day": "pool.hint.on-this-day",
};

function rangeLabel(kinds: WalkRefKind[], { t, locale }: WalkLocale): string {
  if (kinds.length >= WALK_KIND_ORDER.length) return t("pool.all");
  if (kinds.length <= 2)
    return kinds.map(kind => walkKindMeta(kind, t).label).join(t("pool.separator"));
  return t("pool.kindCount", { count: kinds.length, amount: kinds.length.toLocaleString(locale) });
}

export function WalkPoolPicker({
  prefs,
  onChange,
}: {
  prefs: WalkPrefs;
  onChange(prefs: WalkPrefs): void;
}) {
  const language = useWalkI18n();
  const { t } = language;
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
          {rangeLabel(prefs.kinds, language)} · {t(BIAS_MESSAGE[prefs.bias])}
        </Button>
      }
    >
      <div>
        <p className="text-tau-micro text-ink-3 mb-1.5">{t("pool.range")}</p>
        <div className="flex flex-wrap gap-1.5">
          {WALK_KIND_ORDER.map(kind => (
            <FilterPill
              key={kind}
              active={prefs.kinds.includes(kind)}
              label={walkKindMeta(kind, t).label}
              onClick={() => toggleKind(kind)}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="text-tau-micro text-ink-3 mb-1.5">{t("pool.preference")}</p>
        <Segmented
          label={t("pool.preference")}
          value={prefs.bias}
          onValueChange={bias => onChange({ ...prefs, bias })}
        >
          <Segmented.Item value="random" label={t("pool.bias.random")} />
          <Segmented.Item value="stale" label={t("pool.bias.stale")} />
          <Segmented.Item value="on-this-day" label={t("pool.bias.on-this-day")} />
        </Segmented>
        <p className="text-tau-micro text-ink-3 mt-1.5">{t(BIAS_HINT[prefs.bias])}</p>
      </div>
    </Popover>
  );
}
