import type { ReactNode } from "react";
import { Button } from "@tau/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { BreakdownRow } from "../../contracts";
import { useAnalytics, type Filters } from "./api";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-tau-lg bg-surface shadow-card min-w-0 p-5">
      <h2 className="text-tau-title mb-4 font-semibold">{title}</h2>
      {children}
    </section>
  );
}
export function QueryState({
  query,
  children,
}: {
  query: UseQueryResult<unknown>;
  children: ReactNode;
}) {
  if (query.isPending)
    return (
      <p className="text-ink-3" role="status">
        正在读取…
      </p>
    );
  if (query.isError)
    return (
      <div role="alert" className="text-danger space-y-3">
        <p>{query.error.message}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          重试
        </Button>
      </div>
    );
  return <>{children}</>;
}
export function Table({ headings, rows }: { headings: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return <p className="text-ink-3 py-6">所选日期暂无数据。</p>;
  return (
    <div className="overflow-x-auto">
      <table className="text-tau-body w-full text-left tabular-nums">
        <thead>
          <tr>
            {headings.map(heading => (
              <th key={heading} className="text-ink-3 whitespace-nowrap px-3 py-2 font-medium">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="odd:bg-hover">
              {row.map((cell, column) => (
                <td key={column} className="max-w-[28rem] break-words px-3 py-3 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Breakdown({
  title,
  dimension,
  filters,
}: {
  title: string;
  dimension: string;
  filters: Filters;
}) {
  const query = useAnalytics<BreakdownRow[]>("breakdown", filters, dimension);
  return (
    <Section title={title}>
      <QueryState query={query}>
        <Table
          headings={["分组", "数量"]}
          rows={query.data?.data.map(row => [row.label, row.count.toLocaleString()]) ?? []}
        />
      </QueryState>
    </Section>
  );
}
