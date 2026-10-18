import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CloudOff, PackagePlus, Plus } from "lucide-react";
import { Button, Loading, Panel } from "@tau/ui";
import type { SubmissionCounts, SubmissionStatus } from "../../../contracts";
import { queryKeys, useApi } from "../app/api";
import { PageHeader } from "../components/PageHeader";
import { ErrorState, StateBlock } from "../components/states";
import { PluginGroupRow } from "../features/submissions/PluginGroupRow";
import { StatusFilter, type StatusOption } from "../features/submissions/StatusFilter";
import { headlineOf } from "../features/submissions/groups";

const OPTIONS: StatusOption[] = [
  { value: null, label: "全部" },
  { value: "changes_requested", label: "需修改" },
  { value: "pending_review", label: "审核中" },
  { value: "draft", label: "草稿" },
  { value: "approved", label: "已批准" },
  { value: "rejected", label: "已拒绝" },
];

function NewButton() {
  const navigate = useNavigate();
  return (
    <Button variant="primary" icon={Plus} onClick={() => navigate("/submissions/new")}>
      新建提交
    </Button>
  );
}

export function SubmissionsPage() {
  const api = useApi();
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const query = useQuery({
    queryKey: [...queryKeys.submissions, "groups"],
    queryFn: () => api.listSubmissionGroups(),
    refetchOnWindowFocus: true,
  });
  const groups = query.data?.groups ?? [];
  // 筛选与计数都以每个插件「最该关注的那次提交」为准，一个插件只算一次
  const counts = groups.reduce<SubmissionCounts>(
    (sum, group) => ({ ...sum, [headlineOf(group).status]: sum[headlineOf(group).status] + 1 }),
    { draft: 0, pending_review: 0, changes_requested: 0, rejected: 0, approved: 0 }
  );
  const visible = groups.filter(group => !status || headlineOf(group).status === status);
  const toggle = (key: string) =>
    setExpanded(current => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  let body;
  if (query.isPending) body = <Loading minHeight={240} />;
  else if (query.isError)
    body = (
      <ErrorState
        icon={CloudOff}
        title="无法加载提交列表"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isRefetching}
      />
    );
  else if (!groups.length)
    body = (
      <StateBlock icon={PackagePlus} title="还没有提交" actions={<NewButton />}>
        上传包含 README.md 的插件 ZIP，关联源码仓库即可提交审核。
      </StateBlock>
    );
  else
    body = visible.length ? (
      <Panel pad="none" className="overflow-hidden">
        <ul className="divide-line-1 flex flex-col divide-y">
          {visible.map(group => {
            const key = group.pluginId ?? "";
            return (
              <PluginGroupRow
                key={key}
                group={group}
                expanded={expanded.has(key)}
                onToggle={() => toggle(key)}
              />
            );
          })}
        </ul>
      </Panel>
    ) : (
      <Panel className="text-tau-sm text-ink-3 py-12 text-center">这个状态下没有插件</Panel>
    );

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        title="我的提交"
        meta="一个插件一行，展开可以看到它的每次提交；审核意见在对应提交里。"
        actions={groups.length > 0 && <NewButton />}
      />
      {groups.length > 0 && (
        <div className="mb-4">
          <StatusFilter options={OPTIONS} value={status} counts={counts} onChange={setStatus} />
        </div>
      )}
      {body}
    </div>
  );
}
