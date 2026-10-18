import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PackagePlus, Plus } from "lucide-react";
import { Button, Panel } from "@tau/ui";
import type { SubmissionStatus } from "../../../contracts";
import { PageHeader } from "../components/PageHeader";
import { StateBlock } from "../components/states";
import { SubmissionList } from "../features/submissions/SubmissionList";
import { SubmissionRow } from "../features/submissions/SubmissionRow";
import { StatusFilter, type StatusOption } from "../features/submissions/StatusFilter";
import { useSubmissionCounts, useSubmissionList } from "../features/submissions/queries";

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
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const counts = useSubmissionCounts("mine");
  const query = useSubmissionList("mine", status);
  const total = counts.data ? Object.values(counts.data).reduce((sum, n) => sum + n, 0) : null;
  const empty =
    status === null ? (
      <StateBlock icon={PackagePlus} title="还没有提交" actions={<NewButton />}>
        上传包含 README.md 的插件 ZIP，关联源码仓库即可提交审核。
      </StateBlock>
    ) : (
      <Panel className="text-tau-sm text-ink-3 py-12 text-center">这个状态下没有提交</Panel>
    );

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        title="我的提交"
        meta="每次发布新版本都是一条提交；审核意见会出现在对应提交里。"
        actions={total !== 0 && <NewButton />}
      />
      {total !== 0 && (
        <div className="mb-4">
          <StatusFilter
            options={OPTIONS}
            value={status}
            counts={counts.data}
            onChange={setStatus}
          />
        </div>
      )}
      <SubmissionList
        query={query}
        empty={empty}
        renderRow={item => (
          <SubmissionRow
            key={item.id}
            submission={item}
            to={`/submissions/${encodeURIComponent(item.id)}`}
          />
        )}
      />
    </div>
  );
}
