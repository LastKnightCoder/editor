import type { FlashcardType } from "@/types";
import { TYPE_LABEL, TYPE_ORDER, dayDiff, type DeckStats } from "../model";
import { MixBar } from "./FlashcardBits";

import { Block } from "./Block";
import { ForecastChart } from "./ForecastChart";
import { Legend } from "./Legend";
export function DeckSide({
  stats,
  typeCounts,
  now,
  createTime,
}: {
  stats: DeckStats;
  typeCounts: Map<FlashcardType, number>;
  now: number;
  createTime: number;
}) {
  const maxType = Math.max(1, ...typeCounts.values());
  const lastDays = stats.lastReviewTime == null ? null : -dayDiff(stats.lastReviewTime, now);
  const created = new Date(createTime);
  return (
    <div className="flex flex-col gap-[22px] px-5 pb-5 pt-[18px]">
      <Block title="卡片构成" meta={`${stats.total} 张`}>
        {stats.total > 0 && <MixBar stats={stats} />}
        <Legend
          items={[
            ["bg-info", `新卡 ${stats.fresh}`],
            ["bg-warn", `学习中 ${stats.learning}`],
            ["bg-ok", `巩固 ${stats.review}`],
            ...(stats.suspended
              ? ([["bg-ink-3", `已暂停 ${stats.suspended}`]] as [string, string][])
              : []),
          ]}
        />
      </Block>
      <Block title="题型">
        <div className="flex flex-col gap-1.5">
          {TYPE_ORDER.map(type => {
            const n = typeCounts.get(type) ?? 0;
            return (
              <div
                key={type}
                className="text-ink-2 grid grid-cols-[40px_1fr_24px] items-center gap-2.5 text-[12px]"
              >
                <span>{TYPE_LABEL[type]}</span>
                <span className="bg-track h-1.5 overflow-hidden rounded-full">
                  <i
                    className="bg-ink-3 block h-full rounded-full"
                    style={{ width: `${(n / maxType) * 100}%` }}
                  />
                </span>
                <b className="text-right font-medium tabular-nums">{n}</b>
              </div>
            );
          })}
        </div>
      </Block>
      <Block title="未来 7 天到期">
        <ForecastChart values={stats.forecast} now={now} />
      </Block>
      <Block title="记录">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[12.5px]">
          <dt className="text-ink-3">上次复习</dt>
          <dd className="text-right tabular-nums">
            {lastDays == null ? "—" : lastDays <= 0 ? "今天" : `${lastDays} 天前`}
          </dd>
          <dt className="text-ink-3">累计复习</dt>
          <dd className="text-right tabular-nums">{stats.reviewCount} 次</dd>
          <dt className="text-ink-3">创建于</dt>
          <dd className="text-right tabular-nums">
            {created.getFullYear()}年{created.getMonth() + 1}月{created.getDate()}日
          </dd>
        </dl>
      </Block>
    </div>
  );
}
