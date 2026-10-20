import { useState } from "react";
import { CloudOff } from "lucide-react";
import { Loading } from "@tau/ui";
import type { AppFeedbackFilter } from "../../../contracts";
import { useSession } from "../app/session";
import { PageHeader } from "../components/PageHeader";
import { ErrorState } from "../components/states";
import { FeedbackDetail } from "../features/app-feedback/FeedbackDetail";
import { FeedbackList } from "../features/app-feedback/FeedbackList";

export function AppFeedbackPage() {
  const session = useSession();
  if (session.isPending) return <Loading />;
  if (session.isError)
    return (
      <ErrorState
        icon={CloudOff}
        title="无法检查管理权限"
        error={session.error}
        onRetry={() => void session.refetch()}
      />
    );
  if (!session.data?.reviewer)
    return (
      <p role="alert" className="text-tau-body text-ink-2 py-16 text-center">
        只有管理员可以查看用户反馈。
      </p>
    );
  return <AppFeedbackContent />;
}

function AppFeedbackContent() {
  const [filter, setFilter] = useState<AppFeedbackFilter>({
    status: "new",
    kind: "all",
    visitorId: "",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div>
      <PageHeader
        title="用户反馈"
        meta="桌面端用户提交的问题与建议；截图和日志只有管理员可见，180 天后自动删除。"
      />
      <div className="flex items-start gap-6">
        <FeedbackList
          filter={filter}
          onFilterChange={setFilter}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <section className="min-w-0 flex-1">
          <FeedbackDetail
            id={selectedId}
            onFilterVisitor={visitorId => setFilter({ status: "all", kind: "all", visitorId })}
          />
        </section>
      </div>
    </div>
  );
}
