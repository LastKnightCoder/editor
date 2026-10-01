/**
 * 数据库列表视图：共享驾驶舱（features/shared/cockpit）的数据库模块装配。
 * 2026-09-28 从「项目」的 data-table 类型拆出为独立顶级模块。
 */

import { useMemo } from "react";
import { Table } from "lucide-react";
import { usePage } from "@/page/PageProvider";
import { EntityCockpit } from "@/features/shared/cockpit/EntityCockpit";
import type { CockpitCopy, CockpitItem, CockpitVisual } from "@/features/shared/cockpit/types";
import { useDatabasesSnapshot, useDatabaseMutations } from "../queries";

/* 模块色沿用原 projectTypeMeta 的数据表格紫罗兰（设计定稿的数据色，出处
   mockups/projects/plan-c-cockpit.html，不进主题词表） */
const VISUAL: CockpitVisual = {
  icon: Table,
  softClass: "bg-[rgba(111,83,150,0.13)]",
  textClass: "text-[#6f5396]",
  barClass: "bg-gradient-to-r from-[#6f5396] to-transparent",
};

const COPY: CockpitCopy = {
  title: "数据库",
  entityUnit: "个数据库",
  metricUnit: "行",
  metricLabel: "行数",
  recentHint: "最近打开过的数据库",
  createLabel: "新建数据库",
  createTitle: "新建数据库",
  editTitle: "编辑数据库",
  descPlaceholder: "这张表用来记录什么",
  emptyTitle: "还没有数据库",
  emptyHint: "用表格管理结构化数据，支持多视图与筛选排序",
  deleteTitle: "删除数据库",
  deleteDescription: "数据库将被永久删除。",
  deleteImpact:
    "将解除与表格的关联，并清理不再被引用的行详情内容。若表格仍被文档或文档树条目引用则会保留。此操作不可恢复。",
};

export function DatabasesView() {
  const { navigator } = usePage();
  const { items, loading } = useDatabasesSnapshot();
  const mutations = useDatabaseMutations();

  // 数据库没有子条目，只有打开时间，卡片不出现「上次看到」
  const cockpitItems: CockpitItem[] = useMemo(
    () => items.map(item => ({ ...item, metric: item.rowCount, lastItemTitle: null })),
    [items]
  );

  return (
    <EntityCockpit
      prefsKey="databases"
      items={cockpitItems}
      loading={loading}
      visual={VISUAL}
      copy={COPY}
      mutations={mutations}
      onOpen={id => navigator.push("database-detail", { id })}
      onCreated={created => navigator.push("database-detail", { id: created.id })}
    />
  );
}
