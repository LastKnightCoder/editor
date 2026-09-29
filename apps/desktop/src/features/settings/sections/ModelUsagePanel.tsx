/**
 * 大语言模型 · 用量统计 —— 本机记录的每次模型调用（全局 usage.db）：费用、token、调用数的汇总、趋势、排行与明细。
 * 只统计大语言模型；费用按模型单价估算（自定义单价优先，否则目录价），不存 prompt 与回复原文。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, Segmented, Select, toast } from "@tau/ui";
import {
  getModelUsageBreakdown,
  getModelUsageSummary,
  getModelUsageTimeseries,
  listModelUsage,
} from "@/commands";
import type {
  ModelUsageBreakdownRow,
  ModelUsageDimension,
  ModelUsageEvent,
  ModelUsageQuery,
  ModelUsageStatus,
  ModelUsageSummary,
  ModelUsageTimeseriesPoint,
} from "@/types/model-usage";
import { SettingsGroup } from "../components/SettingsGroup";
import { StatusChip } from "../components/StatusChip";
import { ROW_DIVIDER } from "../components/rowDivider";
import { UsageChart, useUsageChartPalette, type UsageChartPalette } from "../components/UsageChart";
import {
  OTHER_KEY,
  RANGE_LABELS,
  bucketStarts,
  buildTrendSeries,
  changeRatio,
  featureLabel,
  formatBucketLabel,
  formatCost,
  formatDuration,
  formatEventTime,
  formatTokens,
  resolveRange,
  tzOffsetMinutes,
  type TrendMetric,
  type UsageRange,
  type UsageRangeKey,
} from "./modelUsageData";

const METRIC_LABELS: Record<TrendMetric, string> = {
  cost: "费用",
  totalTokens: "Token",
  calls: "调用",
};

/** 界面提供的分组维度；主进程另支持按数据库分组，多数人只有一个库，界面不暴露 */
type ChartDimension = Exclude<ModelUsageDimension, "library">;

const DIMENSION_LABELS: Record<ChartDimension, string> = {
  model: "模型",
  feature: "功能",
  provider: "服务商",
};

const STATUS_META: Record<ModelUsageStatus, { label: string; tone: "ok" | "danger" | "warn" }> = {
  ok: { label: "成功", tone: "ok" },
  error: { label: "失败", tone: "danger" },
  aborted: { label: "已取消", tone: "warn" },
};

const PAGE_SIZE = 20;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const formatMetric = (metric: TrendMetric, value: number) =>
  metric === "cost"
    ? formatCost(value)
    : metric === "totalTokens"
      ? formatTokens(value)
      : String(value);

/** 分组键的展示名：功能走中文名，服务商用记录时的服务商名 */
const dimensionLabel = (
  dimension: ChartDimension,
  key: string,
  providerNames?: Map<string, string>
) => {
  if (key === OTHER_KEY) return "其他";
  if (dimension === "feature") return featureLabel(key);
  if (dimension === "provider") return providerNames?.get(key) ?? key;
  return key;
};

/** 「大语言模型」页的「用量统计」tab：页内已有一条 tab 栏，这里用分段控件切概览 / 明细，不再叠第二条 */
export function ModelUsagePanel() {
  const [view, setView] = useState<"overview" | "events">("overview");
  const [rangeKey, setRangeKey] = useState<UsageRangeKey>("7d");
  const [refreshToken, setRefreshToken] = useState(0);
  // 范围按「打开 / 刷新那一刻」解析；否则跨零点停留会让今天的桶错位
  const range = useMemo(() => resolveRange(rangeKey), [rangeKey, refreshToken]);

  return (
    <>
      <div className="mb-5 flex items-center gap-2">
        <Segmented
          label="用量视图"
          size="sm"
          value={view}
          onValueChange={v => setView(v as "overview" | "events")}
        >
          <Segmented.Item value="overview" label="概览" />
          <Segmented.Item value="events" label="调用明细" />
        </Segmented>
        <span className="flex-1" />
        <Segmented
          label="时间范围"
          size="sm"
          value={rangeKey}
          onValueChange={v => setRangeKey(v as UsageRangeKey)}
        >
          {(Object.keys(RANGE_LABELS) as UsageRangeKey[]).map(key => (
            <Segmented.Item key={key} value={key} label={RANGE_LABELS[key]} />
          ))}
        </Segmented>
        <Button
          size="sm"
          variant="ghost"
          icon={RefreshCw}
          onClick={() => setRefreshToken(n => n + 1)}
        >
          刷新
        </Button>
      </div>
      {view === "overview" ? (
        <UsageOverview range={range} refreshToken={refreshToken} />
      ) : (
        <UsageEvents range={range} refreshToken={refreshToken} />
      )}
    </>
  );
}

/* ── 概览：KPI + 趋势 + 排行 ── */

function UsageOverview({ range, refreshToken }: { range: UsageRange; refreshToken: number }) {
  const [summary, setSummary] = useState<ModelUsageSummary | null>(null);
  const [previous, setPrevious] = useState<ModelUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([
      getModelUsageSummary({ from: range.from, to: range.to }),
      getModelUsageSummary(range.previous),
    ])
      .then(([current, prev]) => {
        if (!alive) return;
        setSummary(current);
        setPrevious(prev);
      })
      .catch(e => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [range, refreshToken]);

  if (error) {
    return (
      <SettingsGroup bare>
        <p className="text-tau-meta text-danger px-1">读取用量失败：{error}</p>
      </SettingsGroup>
    );
  }

  const empty = summary !== null && summary.calls === 0;

  return (
    <>
      <KpiRow summary={summary} previous={previous} />
      {empty ? (
        <SettingsGroup bare>
          <div className="bg-surface text-ink-2 text-tau-body rounded-[14px] px-5 py-10 text-center">
            这段时间还没有模型调用记录
            <div className="text-tau-meta text-ink-3 mt-1">
              对话、剪藏、生成等功能调用模型后会出现在这里
            </div>
          </div>
        </SettingsGroup>
      ) : (
        <>
          <TrendGroup range={range} refreshToken={refreshToken} />
          <BreakdownGroup range={range} refreshToken={refreshToken} />
        </>
      )}
    </>
  );
}

function KpiRow({
  summary,
  previous,
}: {
  summary: ModelUsageSummary | null;
  previous: ModelUsageSummary | null;
}) {
  const errorRate = summary && summary.calls > 0 ? (summary.errors / summary.calls) * 100 : null;
  const items: Array<{ label: string; value: string; change: number | null; hint?: string }> = [
    {
      label: "预估费用",
      value: summary ? formatCost(summary.cost) : "—",
      change: summary && previous ? changeRatio(summary.cost, previous.cost) : null,
    },
    {
      label: "Token",
      value: summary ? formatTokens(summary.totalTokens) : "—",
      change: summary && previous ? changeRatio(summary.totalTokens, previous.totalTokens) : null,
      hint: summary
        ? `输入 ${formatTokens(summary.inputTokens)} · 输出 ${formatTokens(summary.outputTokens)}`
        : undefined,
    },
    {
      label: "调用次数",
      value: summary ? summary.calls.toLocaleString("en-US") : "—",
      change: summary && previous ? changeRatio(summary.calls, previous.calls) : null,
      hint: summary && summary.aborted > 0 ? `其中取消 ${summary.aborted} 次` : undefined,
    },
    {
      label: "失败率",
      value: errorRate === null ? "—" : `${errorRate.toFixed(errorRate < 10 ? 1 : 0)}%`,
      change: null,
      hint: summary && summary.errors > 0 ? `失败 ${summary.errors} 次` : undefined,
    },
  ];
  return (
    <SettingsGroup bare>
      {/* 一整块面板内以细线分栏，不做四张小卡漏底 */}
      <div className="bg-surface shadow-card grid grid-cols-4 rounded-[14px]">
        {items.map((item, index) => (
          <div
            key={item.label}
            className={index > 0 ? "border-line-2 border-l px-5 py-4" : "px-5 py-4"}
          >
            <div className="text-tau-meta text-ink-2">{item.label}</div>
            <div className="text-ink-1 font-tau-mono mt-1 text-[22px] font-semibold tabular-nums leading-tight">
              {item.value}
            </div>
            <div className="text-tau-tiny text-ink-3 mt-1 h-4 truncate tabular-nums">
              {item.change !== null ? (
                <>
                  环比 {item.change >= 0 ? "+" : ""}
                  {(item.change * 100).toFixed(0)}%
                </>
              ) : (
                (item.hint ?? "")
              )}
            </div>
          </div>
        ))}
      </div>
    </SettingsGroup>
  );
}

function TrendGroup({ range, refreshToken }: { range: UsageRange; refreshToken: number }) {
  const palette = useUsageChartPalette();
  const [metric, setMetric] = useState<TrendMetric>("cost");
  const [groupBy, setGroupBy] = useState<ChartDimension>("model");
  const [points, setPoints] = useState<ModelUsageTimeseriesPoint[]>([]);
  const [providerNames, setProviderNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let alive = true;
    void Promise.all([
      getModelUsageTimeseries({
        from: range.from,
        to: range.to,
        bucket: range.bucket,
        groupBy,
        tzOffsetMinutes: tzOffsetMinutes(range.from),
      }),
      groupBy === "provider"
        ? getModelUsageBreakdown({ from: range.from, to: range.to, groupBy: "provider" })
        : Promise.resolve([] as ModelUsageBreakdownRow[]),
    ])
      .then(([next, providers]) => {
        if (!alive) return;
        setPoints(next);
        setProviderNames(new Map(providers.map(row => [row.key, row.label])));
      })
      .catch(e => toast.error(`读取趋势失败：${errorText(e)}`));
    return () => {
      alive = false;
    };
  }, [range, groupBy, refreshToken]);

  const option = useMemo(() => {
    const starts = bucketStarts(range);
    const { keys, values } = buildTrendSeries(points, starts, metric);
    return trendOption(palette, {
      categories: starts.map(start => formatBucketLabel(start, range.bucket)),
      series: keys.map(key => ({
        name: dimensionLabel(groupBy, key, providerNames),
        data: values[key],
      })),
      format: value => formatMetric(metric, value),
    });
  }, [points, range, metric, groupBy, palette, providerNames]);

  return (
    <SettingsGroup
      title="趋势"
      description={`按${DIMENSION_LABELS[groupBy]}堆叠，最多显示 5 项，其余合并为「其他」`}
    >
      {/* 控件放面板内的工具行：标题行放不下两组 Segmented（会把标题挤成竖排） */}
      <div className="flex flex-wrap items-center gap-2 px-2 pt-2">
        <Segmented
          label="趋势指标"
          size="sm"
          value={metric}
          onValueChange={v => setMetric(v as TrendMetric)}
        >
          {(Object.keys(METRIC_LABELS) as TrendMetric[]).map(key => (
            <Segmented.Item key={key} value={key} label={METRIC_LABELS[key]} />
          ))}
        </Segmented>
        <span className="flex-1" />
        <Segmented
          label="分组维度"
          size="sm"
          value={groupBy}
          onValueChange={v => setGroupBy(v as ChartDimension)}
        >
          {(Object.keys(DIMENSION_LABELS) as ChartDimension[]).map(key => (
            <Segmented.Item key={key} value={key} label={DIMENSION_LABELS[key]} />
          ))}
        </Segmented>
      </div>
      <div className="px-2 pt-1">
        <UsageChart
          option={option}
          height={260}
          ariaLabel={`${RANGE_LABELS_BY_BUCKET[range.bucket]}${METRIC_LABELS[metric]}趋势，按${DIMENSION_LABELS[groupBy]}分组`}
        />
      </div>
    </SettingsGroup>
  );
}

const RANGE_LABELS_BY_BUCKET = { hour: "每小时", day: "每日" } as const;

function trendOption(
  palette: UsageChartPalette,
  input: {
    categories: string[];
    series: Array<{ name: string; data: number[] }>;
    format: (value: number) => string;
  }
) {
  return {
    color: palette.series,
    animationDuration: 300,
    grid: { left: 8, right: 12, top: 36, bottom: 4, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: palette.ink2, fontSize: 12 },
    },
    tooltip: {
      trigger: "axis",
      // 列底色垫在柱子下面：axisPointer 默认 z=50 会盖住柱子（柱 z=2），悬停的那一列反而发灰
      axisPointer: {
        type: "shadow",
        z: 0,
        shadowStyle: { color: palette.line, opacity: 0.4 },
      },
      backgroundColor: palette.surface,
      borderColor: palette.line,
      textStyle: { color: palette.ink1, fontSize: 12 },
      valueFormatter: (value: number) => input.format(Number(value) || 0),
    },
    xAxis: {
      type: "category",
      data: input.categories,
      axisLine: { lineStyle: { color: palette.line } },
      axisTick: { show: false },
      axisLabel: { color: palette.ink3, fontSize: 11, hideOverlap: true },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: palette.line, type: "dashed" } },
      axisLabel: { color: palette.ink3, fontSize: 11, formatter: input.format },
    },
    series: input.series.map(series => ({
      type: "bar",
      stack: "total",
      name: series.name,
      data: series.data,
      barMaxWidth: 22,
      // 悬停高亮当前系列、其它系列淡化；颜色须是 echarts 能解析的 rgba（见 UsageChart toRgba）
      emphasis: { focus: "series" },
      blur: { itemStyle: { opacity: 0.25 } },
    })),
  };
}

function BreakdownGroup({ range, refreshToken }: { range: UsageRange; refreshToken: number }) {
  const palette = useUsageChartPalette();
  const [groupBy, setGroupBy] = useState<ChartDimension>("feature");
  const [rows, setRows] = useState<ModelUsageBreakdownRow[]>([]);

  useEffect(() => {
    let alive = true;
    getModelUsageBreakdown({ from: range.from, to: range.to, groupBy })
      .then(next => alive && setRows(next))
      .catch(e => toast.error(`读取排行失败：${errorText(e)}`));
    return () => {
      alive = false;
    };
  }, [range, groupBy, refreshToken]);

  const totalCost = rows.reduce((sum, row) => sum + row.cost, 0);
  const pieMetric: TrendMetric = totalCost > 0 ? "cost" : "totalTokens";

  const option = useMemo(() => {
    const top = rows.slice(0, 6);
    const rest = rows.slice(6);
    const data = [
      ...top.map(row => ({
        name: dimensionLabel(groupBy, row.key, new Map([[row.key, row.label]])),
        value: row[pieMetric],
      })),
      ...(rest.length > 0
        ? [{ name: "其他", value: rest.reduce((sum, row) => sum + row[pieMetric], 0) }]
        : []),
    ].filter(item => item.value > 0);
    return {
      color: palette.series,
      animationDuration: 300,
      tooltip: {
        trigger: "item",
        backgroundColor: palette.surface,
        borderColor: palette.line,
        textStyle: { color: palette.ink1, fontSize: 12 },
        valueFormatter: (value: number) => formatMetric(pieMetric, Number(value) || 0),
      },
      series: [
        {
          type: "pie",
          radius: ["58%", "82%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: true,
          label: { show: false },
          itemStyle: { borderColor: palette.surface, borderWidth: 2 },
          // 悬停扇区略放大，其余扇区淡化
          emphasis: { focus: "self", scale: true, scaleSize: 4 },
          blur: { itemStyle: { opacity: 0.25 } },
          data,
        },
      ],
    };
  }, [rows, groupBy, palette, pieMetric]);

  return (
    <SettingsGroup
      title="排行"
      description={`按${DIMENSION_LABELS[groupBy]}汇总，环形图为${pieMetric === "cost" ? "费用" : "Token"}占比`}
    >
      <div className="flex items-center justify-end px-2 pt-2">
        <Segmented
          label="排行维度"
          size="sm"
          value={groupBy}
          onValueChange={v => setGroupBy(v as ChartDimension)}
        >
          {(Object.keys(DIMENSION_LABELS) as ChartDimension[]).map(key => (
            <Segmented.Item key={key} value={key} label={DIMENSION_LABELS[key]} />
          ))}
        </Segmented>
      </div>
      <div className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-1">
        <UsageChart
          option={option}
          height={200}
          ariaLabel={`按${DIMENSION_LABELS[groupBy]}的${pieMetric === "cost" ? "费用" : "Token"}占比`}
        />
        <BreakdownTable rows={rows} groupBy={groupBy} />
      </div>
    </SettingsGroup>
  );
}

function BreakdownTable({
  rows,
  groupBy,
}: {
  rows: ModelUsageBreakdownRow[];
  groupBy: ChartDimension;
}) {
  if (rows.length === 0) {
    return <p className="text-tau-meta text-ink-3 px-3 py-6">暂无数据</p>;
  }
  return (
    <table className="text-tau-sm w-full table-fixed border-collapse">
      <caption className="sr-only">按{DIMENSION_LABELS[groupBy]}的用量排行</caption>
      <thead>
        <tr className="text-ink-3 text-tau-tiny text-left">
          <th scope="col" className="w-[34%] px-3 py-1.5 font-medium">
            {DIMENSION_LABELS[groupBy]}
          </th>
          <th scope="col" className="px-2 py-1.5 text-right font-medium">
            费用
          </th>
          <th scope="col" className="px-2 py-1.5 text-right font-medium">
            Token
          </th>
          <th scope="col" className="px-2 py-1.5 text-right font-medium">
            调用
          </th>
          <th scope="col" className="px-2 py-1.5 text-right font-medium">
            失败
          </th>
          <th scope="col" className="px-3 py-1.5 text-right font-medium">
            平均耗时
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.key} className="border-line-2 border-t">
            <td className="text-ink-1 truncate px-3 py-2" title={row.key}>
              {dimensionLabel(groupBy, row.key, new Map([[row.key, row.label]]))}
            </td>
            <td className="font-tau-mono text-ink-1 px-2 py-2 text-right tabular-nums">
              {formatCost(row.cost)}
            </td>
            <td className="font-tau-mono text-ink-2 px-2 py-2 text-right tabular-nums">
              {formatTokens(row.totalTokens)}
            </td>
            <td className="font-tau-mono text-ink-2 px-2 py-2 text-right tabular-nums">
              {row.calls}
            </td>
            <td
              className={
                row.errors > 0
                  ? "font-tau-mono text-danger px-2 py-2 text-right tabular-nums"
                  : "font-tau-mono text-ink-3 px-2 py-2 text-right tabular-nums"
              }
            >
              {row.errors}
            </td>
            <td className="font-tau-mono text-ink-2 px-3 py-2 text-right tabular-nums">
              {formatDuration(row.avgLatencyMs)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── 调用明细：筛选 + 分页列表 ── */

function UsageEvents({ range, refreshToken }: { range: UsageRange; refreshToken: number }) {
  const [feature, setFeature] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState<"" | ModelUsageStatus>("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<ModelUsageEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [featureOptions, setFeatureOptions] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const requestRef = useRef(0);

  // 筛选项取当前范围内实际出现过的功能 / 模型
  useEffect(() => {
    let alive = true;
    void Promise.all([
      getModelUsageBreakdown({ from: range.from, to: range.to, groupBy: "feature" }),
      getModelUsageBreakdown({ from: range.from, to: range.to, groupBy: "model" }),
    ])
      .then(([features, models]) => {
        if (!alive) return;
        setFeatureOptions(features.map(row => row.key));
        setModelOptions(models.map(row => row.key));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [range, refreshToken]);

  useEffect(() => setPage(0), [range, feature, model, status]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    const query: ModelUsageQuery = {
      from: range.from,
      to: range.to,
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
      ...(feature ? { feature } : {}),
      ...(model ? { model } : {}),
      ...(status ? { status } : {}),
    };
    try {
      const result = await listModelUsage(query);
      if (request !== requestRef.current) return;
      setItems(result.items);
      setTotal(result.total);
    } catch (e) {
      if (request === requestRef.current) toast.error(`读取明细失败：${errorText(e)}`);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [range, page, feature, model, status]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <SettingsGroup
      title={`共 ${total.toLocaleString("en-US")} 次调用`}
      description="点开一行查看完整字段；会话类调用可按会话 ID 在对话记录里回溯"
      action={
        <>
          <Select
            aria-label="按功能筛选"
            size="sm"
            className="w-36"
            value={feature}
            onValueChange={setFeature}
            options={[
              { value: "", label: "全部功能" },
              ...featureOptions.map(key => ({ value: key, label: featureLabel(key) })),
            ]}
          />
          <Select
            aria-label="按模型筛选"
            size="sm"
            className="w-40"
            value={model}
            onValueChange={setModel}
            searchable={modelOptions.length > 8}
            options={[
              { value: "", label: "全部模型" },
              ...modelOptions.map(key => ({ value: key, label: key })),
            ]}
          />
          <Select
            aria-label="按状态筛选"
            size="sm"
            className="w-24"
            value={status}
            onValueChange={v => setStatus(v as "" | ModelUsageStatus)}
            options={[
              { value: "", label: "全部" },
              ...(Object.keys(STATUS_META) as ModelUsageStatus[]).map(key => ({
                value: key,
                label: STATUS_META[key].label,
              })),
            ]}
          />
        </>
      }
    >
      {items.length === 0 ? (
        <p className="text-tau-meta text-ink-3 px-3 py-8 text-center">
          {loading ? "正在读取…" : "没有符合条件的调用"}
        </p>
      ) : (
        <ul aria-busy={loading}>
          {items.map(item => (
            <EventRow
              key={item.eventId}
              item={item}
              open={expanded === item.eventId}
              onToggle={() => setExpanded(id => (id === item.eventId ? null : item.eventId))}
            />
          ))}
        </ul>
      )}
      {total > PAGE_SIZE && (
        <div className="border-line-2 flex items-center justify-end gap-2 border-t px-3 py-2">
          <span className="text-tau-meta text-ink-2 tabular-nums">
            {page + 1} / {pageCount}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            上一页
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage(p => p + 1)}
          >
            下一页
          </Button>
        </div>
      )}
    </SettingsGroup>
  );
}

function EventRow({
  item,
  open,
  onToggle,
}: {
  item: ModelUsageEvent;
  open: boolean;
  onToggle: () => void;
}) {
  const meta = STATUS_META[item.status];
  const detailId = `usage-event-${item.eventId}`;
  return (
    <li className={ROW_DIVIDER}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
        className="hover:bg-hover rounded-tau-sm flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="font-tau-mono text-ink-3 text-tau-meta w-[118px] flex-none tabular-nums">
          {formatEventTime(item.ts)}
        </span>
        <span className="text-ink-1 text-tau-body w-[120px] flex-none truncate">
          {featureLabel(item.feature)}
        </span>
        <span className="font-tau-mono text-ink-2 text-tau-meta min-w-0 flex-1 truncate">
          {item.model}
        </span>
        <span className="font-tau-mono text-ink-2 text-tau-meta w-[72px] flex-none text-right tabular-nums">
          {formatTokens(item.totalTokens)}
        </span>
        <span className="font-tau-mono text-ink-1 text-tau-meta w-[72px] flex-none text-right tabular-nums">
          {formatCost(item.cost)}
        </span>
        <span className="w-[64px] flex-none text-right">
          <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
        </span>
      </button>
      {open && (
        <dl
          id={detailId}
          className="text-tau-meta grid grid-cols-[88px_minmax(0,1fr)_88px_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 pb-3 pt-1"
        >
          <Detail label="服务商" value={item.providerName ?? item.providerId} />
          <Detail label="数据库" value={item.library ?? "未知"} />
          <Detail label="输入" value={formatTokens(item.inputTokens)} />
          <Detail label="输出" value={formatTokens(item.outputTokens)} />
          <Detail label="缓存读取" value={formatTokens(item.cacheReadTokens)} />
          <Detail label="缓存写入" value={formatTokens(item.cacheWriteTokens)} />
          <Detail label="推理" value={formatTokens(item.reasoningTokens)} />
          <Detail
            label="计价"
            value={
              item.costSource === "custom"
                ? "自定义单价"
                : item.costSource === "catalog"
                  ? "目录单价"
                  : "无价格信息"
            }
          />
          <Detail label="耗时" value={formatDuration(item.latencyMs)} />
          <Detail label="首字延迟" value={formatDuration(item.ttftMs)} />
          {item.scope && <Detail label="会话类别" value={item.scope} />}
          {item.sessionId && <Detail label="会话 ID" value={item.sessionId} mono />}
          {item.entityId && <Detail label="关联对象" value={item.entityId} mono />}
          {item.errorMessage && (
            <>
              <dt className="text-ink-3">错误</dt>
              <dd className="text-danger col-span-3 break-words">{item.errorMessage}</dd>
            </>
          )}
        </dl>
      )}
    </li>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd
        className={mono ? "font-tau-mono text-ink-1 truncate" : "text-ink-1 truncate"}
        title={value}
      >
        {value}
      </dd>
    </>
  );
}
