import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { SubmissionQuery, SubmissionStatus } from "../../../../contracts";
import { queryKeys, useApi } from "../../app/api";

type Scope = SubmissionQuery["scope"];

/** 我的提交 / 审核范围的分页列表；status 为 null 时不筛选 */
export function useSubmissionList(scope: Scope, status: SubmissionStatus | null) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...queryKeys.submissions, scope, status],
    queryFn: ({ pageParam }) => api.listSubmissions({ scope, status, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor,
    refetchOnWindowFocus: true,
  });
}

/** 各状态条数（侧栏与顶栏角标）；只取首页的 counts，不受筛选影响 */
export function useSubmissionCounts(scope: Scope, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: [...queryKeys.submissions, "counts", scope],
    queryFn: async () => (await api.listSubmissions({ scope, status: null, cursor: null })).counts,
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
