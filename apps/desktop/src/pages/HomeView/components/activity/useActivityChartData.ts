import { useMemo } from "react";
import dayjs from "dayjs";
import type { HomeTrendPoint, HomeTrendType } from "../../hooks/useHomeData";
import {
  TREND_TYPES,
  type TrendRange,
  type TrendMode,
  type TrendMetric,
  type TrendCategory,
} from "./constants";

export interface ChartValue {
  type: HomeTrendType;
  value: number;
}

export interface ChartBucket {
  bucket: string;
  label: string;
  // 取累计快照的日期（周/月聚合时为该周期结束日，用于 cumulativeAt）
  snapshotDate: string;
  values: ChartValue[];
  total: number;
}

export interface RatioItem {
  type: HomeTrendType;
  value: number;
  ratio: number;
}

export interface ActivityChartData {
  buckets: ChartBucket[];
  ratio: { total: number; items: RatioItem[] };
  maxValue: number;
  hasData: boolean;
  types: HomeTrendType[];
}

// contentTrend 中每个点的 count/wordsCount 是"截至该日的累计总量快照"
// 按类型分组，得到 日期 -> 累计快照 的映射
// 只保留非零记录：useHomeData 会把无后端记录的日期填为 0，
// 若放入 map 会让 cumulativeAt 误返回 0 而非向前回溯找真实快照
const buildCumulativeMap = (
  contentTrend: HomeTrendPoint[],
  metric: TrendMetric,
): Map<HomeTrendType, Map<string, number>> => {
  const byType = new Map<HomeTrendType, Map<string, number>>();
  TREND_TYPES.forEach((t) => byType.set(t, new Map()));
  contentTrend.forEach((p) => {
    if (p[metric] > 0) {
      byType.get(p.type)!.set(p.date, p[metric]);
    }
  });
  return byType;
};

// 前向填充：给定日期，取该日及之前最近一次有数据的累计快照
const cumulativeAt = (
  dateMap: Map<string, number>,
  date: dayjs.Dayjs,
): number => {
  let cur = date;
  // 最多回溯 400 天，避免空数据死循环
  for (let i = 0; i < 400; i++) {
    const v = dateMap.get(cur.format("YYYY-MM-DD"));
    if (v !== undefined) return v;
    cur = cur.subtract(1, "day");
    if (cur.valueOf() < 0) break;
  }
  return 0;
};

const useActivityChartData = (
  contentTrend: HomeTrendPoint[],
  range: TrendRange,
  mode: TrendMode,
  metric: TrendMetric,
  category: TrendCategory,
): ActivityChartData => {
  return useMemo(() => {
    const cumulativeMap = buildCumulativeMap(contentTrend, metric);

    // 按视角生成不同粒度的 bucket
    // 周=日聚合(7点) | 月=周聚合(4-5点) | 年=月聚合(12点) | 总览=周聚合(长期趋势)
    interface RawBucket {
      key: string;
      label: string;
      snapshotDate: string;
    }
    let rawBuckets: RawBucket[];
    let start: dayjs.Dayjs;

    if (range === "week") {
      start = dayjs().subtract(6, "day");
      const days = dayjs().diff(start, "day") + 1;
      rawBuckets = Array.from({ length: days }, (_, i) => {
        const d = start.add(i, "day");
        return {
          key: d.format("YYYY-MM-DD"),
          label: d.format("MM/DD"),
          snapshotDate: d.format("YYYY-MM-DD"),
        };
      });
    } else if (range === "month") {
      // 月增量按周聚合（4-5 点柱状对比）；月累计按日聚合（30 点密集折线）
      start = dayjs().subtract(29, "day");
      const end = dayjs();
      if (mode === "increment") {
        start = start.startOf("week");
        rawBuckets = [];
        let cur = start;
        while (cur.isBefore(end) || cur.isSame(end, "day")) {
          const weekEnd = cur.add(6, "day");
          const snapshot = weekEnd.isAfter(end) ? end : weekEnd;
          const rangeEnd = weekEnd.isAfter(end) ? end : weekEnd;
          rawBuckets.push({
            key: `W${cur.format("YYYY-MM-DD")}`,
            label: `${cur.format("MM/DD")}-${rangeEnd.format("MM/DD")}`,
            snapshotDate: snapshot.format("YYYY-MM-DD"),
          });
          cur = cur.add(7, "day");
        }
      } else {
        const days = end.diff(start, "day") + 1;
        rawBuckets = Array.from({ length: days }, (_, i) => {
          const d = start.add(i, "day");
          return {
            key: d.format("YYYY-MM-DD"),
            label: d.format("MM/DD"),
            snapshotDate: d.format("YYYY-MM-DD"),
          };
        });
      }
    } else if (range === "year") {
      start = dayjs().subtract(1, "year").add(1, "month").startOf("month");
      const end = dayjs();
      const months = end.diff(start, "month") + 1;
      rawBuckets = Array.from({ length: months }, (_, i) => {
        const m = start.add(i, "month");
        return {
          key: m.format("YYYY-MM"),
          label: m.format("YYYY/MM"),
          snapshotDate: m.endOf("month").format("YYYY-MM-DD"),
        };
      });
    } else {
      // 总览：增量按年聚合（柱状图年度对比）；累计按周聚合（密集点面积图）
      let earliest = dayjs();
      cumulativeMap.forEach((m) => {
        m.forEach((_, date) => {
          const d = dayjs(date);
          if (d.isBefore(earliest)) earliest = d;
        });
      });
      start = earliest;
      const end = dayjs();
      if (mode === "increment") {
        // 按年聚合：从最早数据所在年起，每年一个 bucket
        const startYear = earliest.startOf("year");
        const yearCount = end.diff(startYear, "year") + 1;
        rawBuckets = Array.from({ length: yearCount }, (_, i) => {
          const y = startYear.add(i, "year");
          const yEnd = y.endOf("year");
          const snapshot = yEnd.isAfter(end) ? end : yEnd;
          return {
            key: y.format("YYYY"),
            label: y.format("YYYY"),
            snapshotDate: snapshot.format("YYYY-MM-DD"),
          };
        });
      } else {
        rawBuckets = [];
        let cur = start;
        while (cur.isBefore(end) || cur.isSame(end, "day")) {
          const weekStart = cur;
          const weekEnd = cur.add(6, "day");
          const snapshot = weekEnd.isAfter(end) ? end : weekEnd;
          rawBuckets.push({
            key: weekStart.format("YYYY-MM-DD"),
            label: weekStart.format("MM/DD"),
            snapshotDate: snapshot.format("YYYY-MM-DD"),
          });
          cur = cur.add(7, "day");
        }
      }
    }

    const types = category === "all" ? TREND_TYPES : [category];

    // 每个 bucket、每个 type 的"累计总量快照"
    const cumulativeBuckets: ChartBucket[] = rawBuckets.map((rb) => {
      const d = dayjs(rb.snapshotDate);
      const values = types.map((type) => ({
        type,
        value: cumulativeAt(cumulativeMap.get(type)!, d),
      }));
      return {
        bucket: rb.key,
        label: rb.label,
        snapshotDate: rb.snapshotDate,
        values,
        total: values.reduce((s, v) => s + v.value, 0),
      };
    });

    // 增量 = 当 bucket 累计 - 前 bucket 累计
    // 首个 bucket 的基准取 range 起始前一日的累计快照，否则第一段会显示成历史总量
    const baseline = start.subtract(1, "day");
    const incrementBuckets = cumulativeBuckets.map((b, i) => {
      const values = b.values.map((v) => {
        const prevVal =
          i > 0
            ? (cumulativeBuckets[i - 1].values.find((x) => x.type === v.type)
                ?.value ?? 0)
            : cumulativeAt(cumulativeMap.get(v.type)!, baseline);
        return { ...v, value: Math.max(0, v.value - prevVal) };
      });
      return {
        ...b,
        values,
        total: values.reduce((s, v) => s + v.value, 0),
      };
    });

    const chartBuckets =
      mode === "cumulative" ? cumulativeBuckets : incrementBuckets;

    // 占比：增量模式用期间增量之和；累计模式用最新累计值
    const ratioItems: RatioItem[] = TREND_TYPES.map((type) => {
      let value: number;
      if (mode === "cumulative") {
        const last = cumulativeBuckets[cumulativeBuckets.length - 1];
        value = last?.values.find((v) => v.type === type)?.value ?? 0;
      } else {
        value = incrementBuckets.reduce(
          (s, b) => s + (b.values.find((v) => v.type === type)?.value ?? 0),
          0,
        );
      }
      return { type, value, ratio: 0 };
    });
    const ratioTotal = ratioItems.reduce((s, i) => s + i.value, 0);
    ratioItems.forEach((i) => {
      i.ratio = ratioTotal > 0 ? i.value / ratioTotal : 0;
    });

    // 堆叠面积图（累计+全部类别）下，maxValue 应为各 bucket 总和（堆叠顶）的最大值
    const isStacked = mode === "cumulative" && category === "all";
    const maxValue = isStacked
      ? Math.max(...chartBuckets.map((b) => b.total), 1)
      : Math.max(
          ...chartBuckets.flatMap((b) => b.values.map((v) => v.value)),
          1,
        );

    return {
      buckets: chartBuckets,
      ratio: { total: ratioTotal, items: ratioItems },
      maxValue,
      hasData: ratioTotal > 0,
      types,
    };
  }, [contentTrend, range, mode, metric, category]);
};

export default useActivityChartData;
