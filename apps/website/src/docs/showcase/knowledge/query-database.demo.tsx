/**
 * 查询数据库：切换预设查询（读书卡片 / 本月日记 / 标签统计），点选参数芯片实时改变过滤条件并刷新结果表。
 */
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Code2, RefreshCw } from "lucide-react";
import { Tag, cn, type TagColor } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

type PresetId = "cards" | "diary" | "summary";

interface CardRecord {
  id: string;
  title: string;
  tags: string[];
  words: number;
  updated: string;
}

const CARDS: CardRecord[] = [
  {
    id: "c1",
    title: "专注是可以练习的",
    tags: ["读书", "深度工作"],
    words: 420,
    updated: "今天 09:20",
  },
  {
    id: "c2",
    title: "注意力残留与任务切换",
    tags: ["读书", "深度工作"],
    words: 680,
    updated: "昨天 21:10",
  },
  { id: "c3", title: "卡片写作的最小粒度", tags: ["写作"], words: 540, updated: "11-24" },
  { id: "c4", title: "间隔重复为什么有效", tags: ["读书", "学习"], words: 260, updated: "11-22" },
  { id: "c5", title: "长文提纲的三种拆法", tags: ["写作", "方法"], words: 810, updated: "11-19" },
];

const DIARIES = [
  { id: "d1", date: "2026-11-28", mood: "平静", weather: "晴", words: 310, source: "11月28日" },
  { id: "d2", date: "2026-11-26", mood: "专注", weather: "多云", words: 520, source: "11月26日" },
  { id: "d3", date: "2026-11-23", mood: "充实", weather: "晴", words: 440, source: "11月23日" },
  { id: "d4", date: "2026-11-18", mood: "疲惫", weather: "小雨", words: 190, source: "11月18日" },
];

const TAG_COLOR: Record<string, TagColor> = {
  读书: "blue",
  深度工作: "purple",
  写作: "green",
  学习: "orange",
  方法: "gray",
};

const PRESETS: { id: PresetId; label: string }[] = [
  { id: "cards", label: "读书卡片" },
  { id: "diary", label: "本月日记" },
  { id: "summary", label: "按标签汇总" },
];

export default function QueryDatabaseDemo() {
  const [preset, setPreset] = useState<PresetId>("cards");
  const [tagParam, setTagParam] = useState<"读书" | "写作" | "全部">("读书");
  const [minWords, setMinWords] = useState<0 | 300 | 600>(0);
  const [showQuery, setShowQuery] = useState(true);

  const filteredCards = useMemo(
    () =>
      CARDS.filter(
        card => (tagParam === "全部" || card.tags.includes(tagParam)) && card.words >= minWords
      ),
    [tagParam, minWords]
  );

  const summaryRows = useMemo(() => {
    const map = new Map<string, { count: number; words: number }>();
    for (const card of CARDS) {
      const mainTag = card.tags[0];
      const item = map.get(mainTag) ?? { count: 0, words: 0 };
      item.count += 1;
      item.words += card.words;
      map.set(mainTag, item);
    }
    return [...map.entries()].map(([tag, stat]) => ({ tag, ...stat }));
  }, []);

  const dsl =
    preset === "cards"
      ? `TABLE title AS "内容", tags AS "标签", wordCount AS "字数"\nFROM cards\nWHERE ${tagParam === "全部" ? "wordCount >= params.minWords" : `hasTag(params.tag) AND wordCount >= params.minWords`}\nSORT updatedAt DESC`
      : preset === "diary"
        ? `TABLE date AS "日期", mood AS "心情", weather AS "天气", wordCount AS "字数"\nFROM diary\nWHERE year(date) = year(today()) AND month(date) = month(today())\nSORT date DESC`
        : `TABLE tags[0] AS "主标签", count() AS "卡片数", sum(wordCount) AS "总字数"\nFROM cards\nGROUP BY tags[0]\nSORT 总字数 DESC`;

  const rowCount =
    preset === "cards"
      ? filteredCards.length
      : preset === "diary"
        ? DIARIES.length
        : summaryRows.length;

  return (
    <AppWindow active="databases" crumb="数据库 / 实时查询" height={430}>
      <div className="flex h-full flex-col px-6 pt-4 pb-4 max-sm:px-3.5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {PRESETS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPreset(item.id)}
                className={cn(
                  "text-tau-sm h-7 rounded-[8px] px-2.5 transition-colors",
                  preset === item.id
                    ? "bg-selected text-ink-1 font-medium"
                    : "text-ink-2 hover:bg-hover"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="text-ink-3 text-tau-tiny ml-auto flex items-center gap-1.5 tabular-nums">
            <RefreshCw className="size-3" strokeWidth={1.75} />
            {rowCount} 条 · 刚刚更新
          </span>
          <button
            type="button"
            onClick={() => setShowQuery(value => !value)}
            className="border-line-1 text-ink-2 hover:text-ink-1 text-tau-sm inline-flex h-7 items-center gap-1 rounded-[8px] border px-2.5"
          >
            <Code2 className="size-3.5" strokeWidth={1.75} />
            查询
            {showQuery ? (
              <ChevronUp className="size-3.5" strokeWidth={1.75} />
            ) : (
              <ChevronDown className="size-3.5" strokeWidth={1.75} />
            )}
          </button>
        </div>

        {showQuery && (
          <div className="border-line-1 bg-page mb-3 shrink-0 rounded-[10px] border p-3">
            {preset === "cards" && (
              <div className="border-line-2 mb-2.5 flex flex-wrap items-center gap-2 border-b pb-2 text-[11.5px]">
                <span className="text-ink-3">参数</span>
                <span className="text-ink-2 flex items-center gap-1">
                  <code className="font-tau-mono text-[11px]">tag</code>
                  {(["读书", "写作", "全部"] as const).map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTagParam(value)}
                      className={cn(
                        "rounded-[6px] px-2 py-0.5 transition-colors",
                        tagParam === value
                          ? "bg-accent-soft text-accent-text font-medium"
                          : "bg-surface text-ink-2 hover:bg-hover"
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </span>
                <span className="text-ink-2 ml-2 flex items-center gap-1">
                  <code className="font-tau-mono text-[11px]">minWords</code>
                  {([0, 300, 600] as const).map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMinWords(value)}
                      className={cn(
                        "rounded-[6px] px-2 py-0.5 tabular-nums transition-colors",
                        minWords === value
                          ? "bg-accent-soft text-accent-text font-medium"
                          : "bg-surface text-ink-2 hover:bg-hover"
                      )}
                    >
                      ≥{value}
                    </button>
                  ))}
                </span>
              </div>
            )}
            <pre className="font-tau-mono text-ink-1 overflow-x-auto text-[11.5px] leading-[1.6]">
              {dsl}
            </pre>
          </div>
        )}

        <div className="border-line-1 scrollbar-hide min-h-0 flex-1 overflow-y-auto rounded-[10px] border">
          {preset === "cards" && (
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead className="bg-page text-ink-3 border-line-2 border-b text-[11.5px]">
                <tr>
                  <th className="px-3 py-2 font-medium">内容</th>
                  <th className="px-3 py-2 font-medium">标签</th>
                  <th className="px-3 py-2 text-right font-medium">字数</th>
                  <th className="px-3 py-2 text-right font-medium max-sm:hidden">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {filteredCards.map(card => (
                  <tr
                    key={card.id}
                    className="border-line-2 hover:bg-hover/60 border-b last:border-b-0"
                  >
                    <td className="text-ink-1 px-3 py-2 font-medium">{card.title}</td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap gap-1">
                        {card.tags.map(tag => (
                          <Tag key={tag} color={TAG_COLOR[tag] ?? "gray"}>
                            {tag}
                          </Tag>
                        ))}
                      </span>
                    </td>
                    <td className="text-ink-2 px-3 py-2 text-right tabular-nums">{card.words}</td>
                    <td className="text-ink-3 px-3 py-2 text-right tabular-nums max-sm:hidden">
                      {card.updated}
                    </td>
                  </tr>
                ))}
                {filteredCards.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-ink-3 py-8 text-center">
                      当前参数下没有匹配的卡片
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {preset === "diary" && (
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead className="bg-page text-ink-3 border-line-2 border-b text-[11.5px]">
                <tr>
                  <th className="px-3 py-2 font-medium">日期</th>
                  <th className="px-3 py-2 font-medium">心情</th>
                  <th className="px-3 py-2 font-medium">天气</th>
                  <th className="px-3 py-2 text-right font-medium">字数</th>
                </tr>
              </thead>
              <tbody>
                {DIARIES.map(item => (
                  <tr
                    key={item.id}
                    className="border-line-2 hover:bg-hover/60 border-b last:border-b-0"
                  >
                    <td className="text-ink-1 px-3 py-2 font-medium tabular-nums">{item.date}</td>
                    <td className="px-3 py-2">
                      <Tag color="blue">{item.mood}</Tag>
                    </td>
                    <td className="text-ink-2 px-3 py-2">{item.weather}</td>
                    <td className="text-ink-2 px-3 py-2 text-right tabular-nums">{item.words}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {preset === "summary" && (
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead className="bg-page text-ink-3 border-line-2 border-b text-[11.5px]">
                <tr>
                  <th className="px-3 py-2 font-medium">主标签</th>
                  <th className="px-3 py-2 text-right font-medium">卡片数</th>
                  <th className="px-3 py-2 text-right font-medium">总字数</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map(row => (
                  <tr
                    key={row.tag}
                    className="border-line-2 hover:bg-hover/60 border-b last:border-b-0"
                  >
                    <td className="px-3 py-2">
                      <Tag color={TAG_COLOR[row.tag] ?? "gray"}>{row.tag}</Tag>
                    </td>
                    <td className="text-ink-2 px-3 py-2 text-right tabular-nums">{row.count}</td>
                    <td className="text-ink-1 px-3 py-2 text-right font-medium tabular-nums">
                      {row.words}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppWindow>
  );
}
