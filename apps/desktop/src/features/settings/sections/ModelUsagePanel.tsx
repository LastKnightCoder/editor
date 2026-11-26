/**
 * 大语言模型 · 用量统计 —— 本机记录的每次模型调用（全局 usage.db）：费用、token、调用数的汇总、趋势、排行与明细。
 * 只统计大语言模型；费用按模型单价估算（自定义单价优先，否则目录价），不存 prompt 与回复原文。
 */

import { llmText, llmValue, llmFormat, useLlmSettingsI18n } from "./llm.i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettingsStore } from "@/app/settingsStore";
import { getModelUsagePlugins } from "@/commands/model-usage";
import { PluginAIActivity } from "./PluginAIActivity";
import { RefreshCw } from "lucide-react";
import { ROW_DIVIDER, Button, Segmented, Select, toast } from "@tau/ui";
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
import { UsageChart, useUsageChartPalette, type UsageChartPalette } from "../components/UsageChart";
import { UsageDevicesGroup } from "./UsageDevicesGroup";
import {
  OTHER_KEY,
  USAGE_RANGES,
  bucketStarts,
  buildTrendSeries,
  changeRatio,
  resolveRange,
  tzOffsetMinutes,
  type TrendMetric,
  type UsageRange,
  type UsageRangeKey,
} from "./modelUsageData";

const METRIC_LABELS: Record<TrendMetric, string> = {
  get cost() {
    return llmText("ui.cost");
  },
  totalTokens: "Token",
  get calls() {
    return llmText("ui.calls");
  },
};

/** 界面提供的分组维度；主进程另支持按数据库分组，多数人只有一个库，界面不暴露 */
type ChartDimension = Exclude<ModelUsageDimension, "library" | "device">;

const DIMENSION_LABELS: Record<ChartDimension, string> = {
  get model() {
    return llmText("ui.models");
  },
  get feature() {
    return llmText("ui.feature");
  },
  get provider() {
    return llmText("ui.provider");
  },
};

const STATUS_META: Record<ModelUsageStatus, { label: string; tone: "ok" | "danger" | "warn" }> = {
  running: {
    get label() {
      return llmText("ui.running");
    },
    tone: "warn",
  },
  ok: {
    get label() {
      return llmText("ui.succeeded");
    },
    tone: "ok",
  },
  error: {
    get label() {
      return llmText("ui.failed");
    },
    tone: "danger",
  },
  aborted: {
    get label() {
      return llmText("ui.cancelled");
    },
    tone: "warn",
  },
};

const PAGE_SIZE = 20;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const formatMetric = (metric: TrendMetric, value: number) =>
  metric === "cost"
    ? llmFormat.formatCost(value)
    : metric === "totalTokens"
      ? llmFormat.formatTokens(value)
      : String(value);

/** 分组键的展示名：功能走中文名，服务商用记录时的服务商名 */
const dimensionLabel = (
  dimension: ChartDimension,
  key: string,
  providerNames?: Map<string, string>,
  other = llmText("ui.other")
) => {
  if (key === OTHER_KEY) return other;
  if (dimension === "feature") return llmFormat.featureLabel(providerNames?.get(key) ?? key);
  if (dimension === "provider") return providerNames?.get(key) ?? key;
  return key;
};

/** 「大语言模型」页的「用量统计」tab：页内已有一条 tab 栏，这里用分段控件切概览 / 明细，不再叠第二条 */
export function ModelUsagePanel() {
  useLlmSettingsI18n();

  const pluginId = useSettingsStore(state => state.usagePluginId) || undefined;
  const plugins = useQuery({
    queryKey: ["model-usage-plugins"],
    queryFn: getModelUsagePlugins,
    refetchOnWindowFocus: true,
    refetchInterval: 5000,
  });
  const [view, setView] = useState<"overview" | "events">("overview");
  const [rangeKey, setRangeKey] = useState<UsageRangeKey>("7d");
  const [refreshToken, setRefreshToken] = useState(0);
  // 范围按「打开 / 刷新那一刻」解析；否则跨零点停留会让今天的桶错位
  const range = useMemo(
    () => ({ ...resolveRange(rangeKey), pluginId }),
    [rangeKey, refreshToken, pluginId]
  );

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <Select
          aria-label={llmText("ui.filterUsageByPlugin")}
          value={pluginId ?? ""}
          onValueChange={value => useSettingsStore.setState({ usagePluginId: value ?? "" })}
          options={[
            {
              value: "",
              get label() {
                return llmText("ui.allCallsIncludingPlugins");
              },
            },
            ...(plugins.data ?? []).map(plugin => ({
              value: plugin.id,
              label: plugin.name || plugin.id,
            })),
            ...(pluginId && !plugins.data?.some(plugin => plugin.id === pluginId)
              ? [{ value: pluginId, label: pluginId }]
              : []),
          ]}
        />
      </div>
      <PluginAIActivity pluginId={pluginId} />
      <p className="text-tau-meta text-ink-2 mb-4">
        {llmText("ui.costsAreEstimatesBasedOnKnownUsage")}
      </p>
      <div className="mb-5 flex items-center gap-2">
        <Segmented
          label={llmText("ui.usageView")}
          size="sm"
          value={view}
          onValueChange={v => setView(v as "overview" | "events")}
        >
          <Segmented.Item value="overview" label={llmText("ui.overview")} />
          <Segmented.Item value="events" label={llmText("ui.callDetails")} />
        </Segmented>
        <span className="flex-1" />
        <Segmented
          label={llmText("ui.timeRange")}
          size="sm"
          value={rangeKey}
          onValueChange={v => setRangeKey(v as UsageRangeKey)}
        >
          {USAGE_RANGES.map(key => (
            <Segmented.Item key={key} value={key} label={llmFormat.rangeLabel(key)} />
          ))}
        </Segmented>
        <Button
          size="sm"
          variant="ghost"
          icon={RefreshCw}
          onClick={() => setRefreshToken(n => n + 1)}
        >
          {llmText("ui.refresh")}
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
  useLlmSettingsI18n();

  const [summary, setSummary] = useState<ModelUsageSummary | null>(null);
  const [previous, setPrevious] = useState<ModelUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([
      getModelUsageSummary({ pluginId: range.pluginId, from: range.from, to: range.to }),
      getModelUsageSummary({ ...range.previous, pluginId: range.pluginId }),
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
        <p className="text-tau-meta text-danger px-1">
          {llmText("ui.couldNotLoadUsage")}
          {error}
        </p>
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
            {llmText("ui.noModelCallsInThisPeriod")}
            <div className="text-tau-meta text-ink-3 mt-1">
              {llmText("ui.modelCallsFromChatClippingGenerationAnd")}
            </div>
          </div>
        </SettingsGroup>
      ) : (
        <>
          <TrendGroup range={range} refreshToken={refreshToken} />
          <BreakdownGroup range={range} refreshToken={refreshToken} />
        </>
      )}
      <UsageDevicesGroup refreshToken={refreshToken} />
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
  useLlmSettingsI18n();

  const errorRate = summary && summary.calls > 0 ? (summary.errors / summary.calls) * 100 : null;
  const items: Array<{ label: string; value: string; change: number | null; hint?: string }> = [
    {
      get label() {
        return llmText("ui.estimatedCost");
      },
      value: summary ? llmFormat.formatCost(summary.cost) : "—",
      change: summary && previous ? changeRatio(summary.cost, previous.cost) : null,
    },
    {
      label: "Token",
      value: summary ? llmFormat.formatTokens(summary.totalTokens) : "—",
      change: summary && previous ? changeRatio(summary.totalTokens, previous.totalTokens) : null,
      hint: summary
        ? llmText("message.inputOutput", {
            input: llmValue(llmFormat.formatTokens(summary.inputTokens)),
            output: llmValue(llmFormat.formatTokens(summary.outputTokens)),
          })
        : undefined,
    },
    {
      get label() {
        return llmText("ui.calls2");
      },
      value: summary ? summary.calls.toLocaleString("en-US") : "—",
      change: summary && previous ? changeRatio(summary.calls, previous.calls) : null,
      hint:
        summary && summary.aborted > 0
          ? llmText("message.cancelled", { count: llmValue(summary.aborted) })
          : undefined,
    },
    {
      get label() {
        return llmText("ui.failureRate");
      },
      value: errorRate === null ? "—" : `${errorRate.toFixed(errorRate < 10 ? 1 : 0)}%`,
      change: null,
      hint:
        summary && summary.errors > 0
          ? llmText("message.failed", { count: llmValue(summary.errors) })
          : undefined,
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
            <div className="text-ink-1 font-tau-mono mt-1 text-[22px] leading-tight font-semibold tabular-nums">
              {item.value}
            </div>
            <div className="text-tau-tiny text-ink-3 mt-1 h-4 truncate tabular-nums">
              {item.change !== null ? (
                <>
                  {llmText("ui.change")} {item.change >= 0 ? "+" : ""}
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
  const { t } = useLlmSettingsI18n();

  const palette = useUsageChartPalette();
  const [metric, setMetric] = useState<TrendMetric>("cost");
  const [groupBy, setGroupBy] = useState<ChartDimension>("model");
  const [points, setPoints] = useState<ModelUsageTimeseriesPoint[]>([]);
  const [providerNames, setProviderNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let alive = true;
    void Promise.all([
      getModelUsageTimeseries({
        pluginId: range.pluginId,
        from: range.from,
        to: range.to,
        bucket: range.bucket,
        groupBy,
        tzOffsetMinutes: tzOffsetMinutes(range.from),
      }),
      groupBy === "provider" || groupBy === "feature"
        ? getModelUsageBreakdown({
            pluginId: range.pluginId,
            from: range.from,
            to: range.to,
            groupBy,
          })
        : Promise.resolve([] as ModelUsageBreakdownRow[]),
    ])
      .then(([next, providers]) => {
        if (!alive) return;
        setPoints(next);
        setProviderNames(new Map(providers.map(row => [row.key, row.label])));
      })
      .catch(e =>
        toast.error(llmText("message.couldNotLoadTrend", { error: llmValue(errorText(e)) }))
      );
    return () => {
      alive = false;
    };
  }, [range, groupBy, refreshToken]);

  const option = useMemo(() => {
    const starts = bucketStarts(range);
    const { keys, values } = buildTrendSeries(points, starts, metric);
    return trendOption(palette, {
      categories: starts.map(start => llmFormat.formatBucketLabel(start, range.bucket)),
      series: keys.map(key => ({
        name: dimensionLabel(groupBy, key, providerNames, t("ui.other")),
        data: values[key],
      })),
      format: value => formatMetric(metric, value),
    });
  }, [points, range, metric, groupBy, palette, providerNames, t]);

  return (
    <SettingsGroup
      title={llmText("ui.trend")}
      description={llmText("message.stackedByShowingUpTo5Groups", {
        dimension: llmValue(DIMENSION_LABELS[groupBy]),
      })}
    >
      {/* 控件放面板内的工具行：标题行放不下两组 Segmented（会把标题挤成竖排） */}
      <div className="flex flex-wrap items-center gap-2 px-2 pt-2">
        <Segmented
          label={llmText("ui.trendMetric")}
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
          label={llmText("ui.groupBy")}
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
          ariaLabel={llmText("message.trendGroupedBy", {
            frequency: llmValue(RANGE_LABELS_BY_BUCKET[range.bucket]),
            metric: llmValue(METRIC_LABELS[metric]),
            dimension: llmValue(DIMENSION_LABELS[groupBy]),
          })}
        />
      </div>
    </SettingsGroup>
  );
}

const RANGE_LABELS_BY_BUCKET = {
  get hour() {
    return llmText("ui.hourly");
  },
  get day() {
    return llmText("ui.daily");
  },
} as const;

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
  const { t } = useLlmSettingsI18n();

  const palette = useUsageChartPalette();
  const [groupBy, setGroupBy] = useState<ChartDimension>("feature");
  const [rows, setRows] = useState<ModelUsageBreakdownRow[]>([]);

  useEffect(() => {
    let alive = true;
    getModelUsageBreakdown({ pluginId: range.pluginId, from: range.from, to: range.to, groupBy })
      .then(next => alive && setRows(next))
      .catch(e =>
        toast.error(llmText("message.couldNotLoadRanking", { error: llmValue(errorText(e)) }))
      );
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
        ? [{ name: t("ui.other"), value: rest.reduce((sum, row) => sum + row[pieMetric], 0) }]
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
  }, [rows, groupBy, palette, pieMetric, t]);

  return (
    <SettingsGroup
      title={llmText("ui.ranking")}
      description={llmText("message.groupedByTheDonutChartShowsThe", {
        dimension: llmValue(DIMENSION_LABELS[groupBy]),
        metric: llmValue(pieMetric === "cost" ? llmText("ui.cost") : "Token"),
      })}
    >
      <div className="flex items-center justify-end px-2 pt-2">
        <Segmented
          label={llmText("ui.rankBy")}
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
          ariaLabel={llmText("message.shareBy", {
            dimension: llmValue(DIMENSION_LABELS[groupBy]),
            metric: llmValue(pieMetric === "cost" ? llmText("ui.cost") : "Token"),
          })}
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
  useLlmSettingsI18n();

  if (rows.length === 0) {
    return <p className="text-tau-meta text-ink-3 px-3 py-6">{llmText("ui.noData")}</p>;
  }
  return (
    <table className="text-tau-sm w-full table-fixed border-collapse">
      <caption className="sr-only">
        {llmText("usage.rankingCaption", { dimension: DIMENSION_LABELS[groupBy] })}
      </caption>
      <thead>
        <tr className="text-ink-3 text-tau-tiny text-left">
          <th scope="col" className="w-[34%] px-3 py-1.5 font-medium">
            {DIMENSION_LABELS[groupBy]}
          </th>
          <th scope="col" className="px-2 py-1.5 text-right font-medium">
            {llmText("ui.cost")}
          </th>
          <th scope="col" className="px-2 py-1.5 text-right font-medium">
            Token
          </th>
          <th scope="col" className="px-2 py-1.5 text-right font-medium">
            {llmText("ui.calls")}
          </th>
          <th scope="col" className="px-2 py-1.5 text-right font-medium">
            {llmText("ui.failed")}
          </th>
          <th scope="col" className="px-3 py-1.5 text-right font-medium">
            {llmText("ui.averageDuration")}
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
              {llmFormat.formatCost(row.cost)}
            </td>
            <td className="font-tau-mono text-ink-2 px-2 py-2 text-right tabular-nums">
              {llmFormat.formatTokens(row.totalTokens)}
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
              {llmFormat.formatDuration(row.avgLatencyMs)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── 调用明细：筛选 + 分页列表 ── */

function UsageEvents({ range, refreshToken }: { range: UsageRange; refreshToken: number }) {
  useLlmSettingsI18n();

  const [feature, setFeature] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState<"" | ModelUsageStatus>("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<ModelUsageEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [featureOptions, setFeatureOptions] = useState<string[]>([]);
  const [featureNames, setFeatureNames] = useState(new Map<string, string>());
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const requestRef = useRef(0);

  // 筛选项取当前范围内实际出现过的功能 / 模型
  useEffect(() => {
    let alive = true;
    void Promise.all([
      getModelUsageBreakdown({
        pluginId: range.pluginId,
        from: range.from,
        to: range.to,
        groupBy: "feature",
      }),
      getModelUsageBreakdown({
        pluginId: range.pluginId,
        from: range.from,
        to: range.to,
        groupBy: "model",
      }),
    ])
      .then(([features, models]) => {
        if (!alive) return;
        setFeatureOptions(features.map(row => row.key));
        setFeatureNames(new Map(features.map(row => [row.key, row.label])));
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
      pluginId: range.pluginId,
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
      if (request === requestRef.current)
        toast.error(llmText("message.couldNotLoadCallDetails", { error: llmValue(errorText(e)) }));
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
      title={llmText("message.calls", { count: llmValue(total.toLocaleString("en-US")) })}
      description={llmText("ui.openARowForFullDetailsUse")}
      action={
        <>
          <Select
            aria-label={llmText("ui.filterByFeature")}
            size="sm"
            className="w-36"
            value={feature}
            onValueChange={setFeature}
            options={[
              {
                value: "",
                get label() {
                  return llmText("ui.allFeatures");
                },
              },
              ...featureOptions.map(key => ({
                value: key,
                label: llmFormat.featureLabel(featureNames.get(key) ?? key),
              })),
            ]}
          />
          <Select
            aria-label={llmText("ui.filterByModel")}
            size="sm"
            className="w-40"
            value={model}
            onValueChange={setModel}
            searchable={modelOptions.length > 8}
            options={[
              {
                value: "",
                get label() {
                  return llmText("ui.allModels");
                },
              },
              ...modelOptions.map(key => ({ value: key, label: key })),
            ]}
          />
          <Select
            aria-label={llmText("ui.filterByStatus")}
            size="sm"
            className="w-24"
            value={status}
            onValueChange={v => setStatus(v as "" | ModelUsageStatus)}
            options={[
              {
                value: "",
                get label() {
                  return llmText("ui.all");
                },
              },
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
          {loading ? llmText("ui.loading2") : llmText("ui.noMatchingCalls")}
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
            {llmText("ui.previous")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage(p => p + 1)}
          >
            {llmText("ui.next")}
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
  useLlmSettingsI18n();

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
          {llmFormat.formatEventTime(item.ts)}
        </span>
        <span className="text-ink-1 text-tau-body w-[120px] flex-none truncate">
          {item.pluginId
            ? `${item.pluginName ?? item.pluginId} / ${item.pluginFeatureName ?? item.feature}`
            : llmFormat.featureLabel(item.feature)}
        </span>
        <span className="font-tau-mono text-ink-2 text-tau-meta min-w-0 flex-1 truncate">
          {item.model}
        </span>
        <span className="font-tau-mono text-ink-2 text-tau-meta w-[72px] flex-none text-right tabular-nums">
          {item.usageKnown === false
            ? llmText("ui.unknown")
            : llmFormat.formatTokens(item.totalTokens)}
        </span>
        <span className="font-tau-mono text-ink-1 text-tau-meta w-[72px] flex-none text-right tabular-nums">
          {item.costSource === "none" ? llmText("ui.unknown") : llmFormat.formatCost(item.cost)}
        </span>
        <span className="w-[64px] flex-none text-right">
          <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
        </span>
      </button>
      {open && (
        <dl
          id={detailId}
          className="text-tau-meta grid grid-cols-[88px_minmax(0,1fr)_88px_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 pt-1 pb-3"
        >
          <Detail label={llmText("ui.provider")} value={item.providerName ?? item.providerId} />
          <Detail label={llmText("ui.database")} value={item.library ?? llmText("ui.unknown")} />
          <Detail label={llmText("ui.input")} value={llmFormat.formatTokens(item.inputTokens)} />
          <Detail label={llmText("ui.output")} value={llmFormat.formatTokens(item.outputTokens)} />
          <Detail
            label={llmText("ui.cacheRead")}
            value={llmFormat.formatTokens(item.cacheReadTokens)}
          />
          <Detail
            label={llmText("ui.cacheWrite")}
            value={llmFormat.formatTokens(item.cacheWriteTokens)}
          />
          <Detail
            label={llmText("ui.reasoning")}
            value={llmFormat.formatTokens(item.reasoningTokens)}
          />
          <Detail
            label={llmText("ui.pricing")}
            value={
              item.costSource === "custom"
                ? llmText("ui.customPrices")
                : item.costSource === "catalog"
                  ? llmText("ui.catalogPrices")
                  : llmText("ui.noPriceInformation")
            }
          />
          <Detail label={llmText("ui.duration")} value={llmFormat.formatDuration(item.latencyMs)} />
          <Detail
            label={llmText("ui.timeToFirstToken")}
            value={llmFormat.formatDuration(item.ttftMs)}
          />
          {item.scope && <Detail label={llmText("ui.sessionType")} value={item.scope} />}
          {item.sessionId && <Detail label={llmText("ui.sessionID")} value={item.sessionId} mono />}
          {item.entityId && <Detail label={llmText("ui.relatedItem")} value={item.entityId} mono />}
          {item.errorMessage && (
            <>
              <dt className="text-ink-3">{llmText("ui.error")}</dt>
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
