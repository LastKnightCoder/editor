import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PLUGIN_DEVELOPER_DOCS_URL } from "@tau/plugins/center";
import { CloudOff, PackagePlus, Plus } from "lucide-react";
import { Button, ConfirmDialog, Loading, Panel } from "@tau/ui";
import type { SubmissionCounts, SubmissionStatus, SubmissionSummary } from "../../../contracts";
import { errorMessage } from "../api/errors";
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
      发布新插件
    </Button>
  );
}

export function SubmissionsPage() {
  const api = useApi();
  const client = useQueryClient();
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<SubmissionSummary | null>(null);
  const query = useQuery({
    queryKey: [...queryKeys.submissions, "groups"],
    queryFn: () => api.listSubmissionGroups(),
    refetchOnWindowFocus: true,
  });
  const remove = useMutation({
    mutationFn: (item: SubmissionSummary) => api.deleteSubmission(item.id),
    onSuccess: (_, item) => {
      setDeleting(null);
      client.removeQueries({ queryKey: queryKeys.submission(item.id) });
      void client.invalidateQueries({ queryKey: queryKeys.submissions });
    },
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
  const askDelete = (item: SubmissionSummary) => {
    remove.reset();
    setDeleting(item);
  };

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
        上传包含 README.md 的插件 ZIP，关联源码仓库即可提交审核。还没做好插件？先看
        <a
          href={PLUGIN_DEVELOPER_DOCS_URL}
          target="_blank"
          rel="noopener"
          className="text-accent-text hover:underline"
        >
          开发文档
        </a>
        。
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
                onDelete={askDelete}
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
        meta="一个插件一行，展开可以看到它的每次提交；已发布的插件在行内点「发布新版本」。"
        actions={groups.length > 0 && <NewButton />}
      />
      {groups.length > 0 && (
        <div className="mb-4">
          <StatusFilter options={OPTIONS} value={status} counts={counts} onChange={setStatus} />
        </div>
      )}
      {body}
      <ConfirmDialog
        open={!!deleting}
        title="删除草稿"
        context={
          deleting ? (deleting.name ?? deleting.pluginId ?? "未上传插件包的草稿") : undefined
        }
        danger
        confirmText="删除"
        onOpenChange={open => {
          if (!open) setDeleting(null);
        }}
        description={
          <div className="flex flex-col gap-2">
            <p>
              {deleting?.version ? `v${deleting.version} 的草稿` : "这条草稿"}
              将被删除，已上传的包不会再关联到任何提交；曾进入审核的记录不能删除。
            </p>
            {remove.isError && (
              <p role="alert" className="text-tau-sm text-danger">
                {errorMessage(remove.error)}
              </p>
            )}
          </div>
        }
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting);
        }}
      />
    </div>
  );
}
