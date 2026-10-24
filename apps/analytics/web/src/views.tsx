import type { Overview, TrendRow } from "../../contracts";
import { useAnalytics, type Filters } from "./api";
import { Breakdown, QueryState, Section, Table } from "./components";

export function VersionsView({ filters }: { filters: Filters }) {
  const summary = useAnalytics<Overview>("overview", filters);
  return (
    <div className="space-y-5">
      <Section title="上报安装数">
        <QueryState query={summary}>
          <div className="text-3xl font-semibold tabular-nums">
            {summary.data?.data.reporting_installations.toLocaleString()}
          </div>
        </QueryState>
      </Section>
      <Breakdown title="应用版本分布" dimension="versions" filters={filters} />
      <p className="text-tau-meta text-ink-3">
        每个安装实例仅取所选日期内最后一次上报的版本。同版本每天首次启动上报，升级后重新上报；不采集启动耗时、使用时长、页面访问或崩溃。
      </p>
    </div>
  );
}

export function DownloadsView({ filters }: { filters: Filters }) {
  const summary = useAnalytics<Overview>("overview", filters);
  const trend = useAnalytics<TrendRow[]>("timeseries", filters);
  return (
    <div className="space-y-5">
      <Section title="下载发起次数">
        <QueryState query={summary}>
          <div className="text-3xl font-semibold tabular-nums">
            {summary.data?.data.download_starts.toLocaleString()}
          </div>
        </QueryState>
      </Section>
      <Section title="每日下载">
        <QueryState query={trend}>
          <Table
            headings={["日期", "下载发起"]}
            rows={trend.data?.data.map(row => [row.day, row.download_starts]) ?? []}
          />
        </QueryState>
      </Section>
      <Breakdown title="安装包与渠道" dimension="downloads" filters={filters} />
      <Breakdown title="下载渠道" dimension="channels" filters={filters} />
      <p className="text-tau-meta text-ink-3">
        统计经过官网下载入口的安装包下载发起，按日、安装包和出口摘要近似去重，不代表下载完成或安装成功。自动更新与
        R2 直链不计入；统计故障时仍可下载。
      </p>
    </div>
  );
}
