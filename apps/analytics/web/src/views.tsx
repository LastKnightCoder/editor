import type { EventRow, Overview, RetentionRow, TrendRow } from "../../contracts";
import { useAnalytics, type Filters } from "./api";
import { Breakdown, QueryState, Section, Table } from "./components";

export function OverviewView({ filters }: { filters: Filters }) {
  const summary = useAnalytics<Overview>("overview", filters);
  const trend = useAnalytics<TrendRow[]>("timeseries", filters);
  const data = summary.data?.data;
  const metrics = data
    ? [
        ["活跃安装", data.active_installations.toLocaleString()],
        ["新增安装", data.new_installations.toLocaleString()],
        ["会话", data.sessions.toLocaleString()],
        ["前台小时", (data.foreground_ms / 3600000).toFixed(1)],
        ["崩溃事件", data.crashes.toLocaleString()],
        ["下载发起", data.download_starts.toLocaleString()],
      ]
    : [];
  return (
    <div className="space-y-5">
      <Section title="概览">
        <QueryState query={summary}>
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-6">
            {metrics.map(([label, value]) => (
              <div key={label}>
                <div className="text-tau-meta text-ink-3">{label}</div>
                <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        </QueryState>
      </Section>
      <Section title="每日趋势">
        <QueryState query={trend}>
          <Table
            headings={["日期", "活跃安装", "新增安装", "事件", "下载发起"]}
            rows={
              trend.data?.data.map(row => [
                row.day,
                row.active_installations,
                row.new_installations,
                row.events,
                row.download_starts,
              ]) ?? []
            }
          />
        </QueryState>
      </Section>
      <p className="text-tau-meta text-ink-3">
        活跃按安装实例去重；旧用户首次接入不计新增。前台时长按会话开始日归属，不表示实际操作时长。
      </p>
    </div>
  );
}
export function UsageView({ filters }: { filters: Filters }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Breakdown title="事件次数" dimension="events" filters={filters} />
      <Breakdown title="页面访问次数" dimension="pages" filters={filters} />
      <Breakdown title="功能使用次数" dimension="features" filters={filters} />
    </div>
  );
}
export function GeographyView({ filters }: { filters: Filters }) {
  return (
    <div className="space-y-5">
      <p className="text-tau-meta text-ink-3">
        地域来自上报时的网络出口，可能受代理影响。同一安装跨天出现在不同省份时可计入多个分组。
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        <Breakdown title="国内省份 · 活跃安装" dimension="provinces" filters={filters} />
        <Breakdown title="国家/地区 · 活跃安装" dimension="countries" filters={filters} />
        <Breakdown title="操作系统 · 活跃安装" dimension="os" filters={filters} />
        <Breakdown title="应用版本 · 活跃安装" dimension="versions" filters={filters} />
      </div>
    </div>
  );
}
export function DownloadsView({ filters }: { filters: Filters }) {
  return (
    <div className="space-y-5">
      <p className="text-tau-meta text-ink-3">
        统计经过本站入口的安装包下载发起，按日/安装包/出口摘要近似去重，不代表下载完成或安装成功。自动更新与
        R2 直链不计入；统计故障时仍可下载。
      </p>
      <Breakdown title="安装包与渠道" dimension="downloads" filters={filters} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Breakdown title="下载渠道" dimension="channels" filters={filters} />
        <Breakdown title="下载省份" dimension="download_provinces" filters={filters} />
      </div>
    </div>
  );
}
export function RetentionView({ filters }: { filters: Filters }) {
  const query = useAnalytics<RetentionRow[]>("retention", filters);
  const cell = (value: number | null, denominator: number) =>
    value === null ? "观察中" : `${((value / denominator) * 100).toFixed(1)}%（${value}）`;
  return (
    <div className="space-y-5">
      <p className="text-tau-meta text-ink-3">
        按明确首次启动的新安装分组，显示第 N
        天是否再次活跃。尚未观察满的日期显示“观察中”，不当成零留存。
      </p>
      <Section title="新安装留存">
        <QueryState query={query}>
          <Table
            headings={["首次启动日期", "新安装", "次日留存", "7日留存", "30日留存"]}
            rows={
              query.data?.data.map(row => [
                row.day,
                row.installations,
                cell(row.d1, row.installations),
                cell(row.d7, row.installations),
                cell(row.d30, row.installations),
              ]) ?? []
            }
          />
        </QueryState>
      </Section>
    </div>
  );
}
export function EventsView({ filters }: { filters: Filters }) {
  const query = useAnalytics<EventRow[]>("events", filters);
  return (
    <Section title="最近50条事件 · 原始明细保留30天">
      <QueryState query={query}>
        <Table
          headings={["发生时间（上海）", "事件", "应用版本", "地域", "属性"]}
          rows={
            query.data?.data.map(row => [
              new Date(row.occurred_at).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
                hour12: false,
              }),
              `${row.name}@${row.event_version}`,
              row.app_version,
              row.region_code,
              <code className="text-tau-sm" key={row.event_id}>
                {JSON.stringify(row.properties)}
              </code>,
            ]) ?? []
          }
        />
      </QueryState>
    </Section>
  );
}
