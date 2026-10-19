import { useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Loading, Panel } from "@tau/ui";
import type { SubmissionStatus } from "../../../contracts";
import { useSession } from "../app/session";
import { PageHeader } from "../components/PageHeader";
import { StateBlock } from "../components/states";
import { SubmissionList } from "../features/submissions/SubmissionList";
import { SubmissionRow } from "../features/submissions/SubmissionRow";
import { StatusFilter, type StatusOption } from "../features/submissions/StatusFilter";
import { useSubmissionCounts, useSubmissionList } from "../features/submissions/queries";

const OPTIONS: StatusOption[] = [
  { value: "pending_review", label: "待审核" },
  { value: "changes_requested", label: "等待作者修改" },
  { value: "approved", label: "已批准" },
  { value: "rejected", label: "已拒绝" },
  { value: null, label: "全部" },
];

export function ReviewQueuePage() {
  const session = useSession();
  if (session.isPending) return <Loading />;
  if (!session.data?.reviewer)
    return (
      <StateBlock icon={ShieldOff} title="只有审核者可以查看审核队列">
        审核者由发布服务配置，作者账号不能自行开启。
      </StateBlock>
    );
  return <ReviewQueue />;
}

function ReviewQueue() {
  const [status, setStatus] = useState<SubmissionStatus | null>("pending_review");
  const counts = useSubmissionCounts("review");
  const query = useSubmissionList("review", status);
  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        title="审核队列"
        meta="打开一条提交即可对照上一发布版本审核；决定绑定当时的修订。"
      />
      <div className="mb-4">
        <StatusFilter options={OPTIONS} value={status} counts={counts.data} onChange={setStatus} />
      </div>
      <SubmissionList
        query={query}
        empty={
          status === "pending_review" ? (
            <StateBlock icon={ShieldCheck} title="都审完了">
              新的提交会出现在这里。
            </StateBlock>
          ) : (
            <Panel className="text-tau-sm text-ink-3 py-12 text-center">这个状态下没有提交</Panel>
          )
        }
        renderRow={item => (
          <SubmissionRow
            key={item.id}
            submission={item}
            to={`/review/${encodeURIComponent(item.id)}`}
          />
        )}
      />
    </div>
  );
}
