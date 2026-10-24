import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Input } from "@tau/ui";
import { api, localDay, queryClient, type Filters } from "./api";
import { DownloadsView, VersionsView } from "./views";

function Login() {
  const [token, setToken] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      api("/v1/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["analytics"] });
      queryClient.setQueryData(["session"], true);
    },
    onSettled: () => setToken(""),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (token && !mutation.isPending) mutation.mutate();
  };
  return (
    <main className="mx-auto mt-24 max-w-md space-y-6 px-6">
      <h1 className="text-2xl font-semibold">Tau 产品统计</h1>
      <p className="text-ink-3">使用管理员凭据登录。</p>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-2">
          <span>管理员凭据</span>
          <Input
            type="password"
            autoComplete="off"
            value={token}
            onChange={event => setToken(event.target.value)}
            required
          />
        </label>
        {mutation.isError && (
          <p role="alert" className="text-danger">
            {mutation.error.message}
          </p>
        )}
        <Button type="submit" variant="primary" loading={mutation.isPending} disabled={!token}>
          登录
        </Button>
      </form>
    </main>
  );
}
const tabs = [
  ["versions", "应用版本", VersionsView],
  ["downloads", "下载统计", DownloadsView],
] as const;

export function App() {
  const session = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      await api("/v1/admin/session");
      return true;
    },
    staleTime: Infinity,
  });
  const [tab, setTab] = useState<string>("versions");
  const [filters, setFilters] = useState<Filters>(() => ({
    from: localDay(Date.now() - 6 * 86400000),
    to: localDay(),
    environment: "production",
  }));
  const logout = useMutation({
    mutationFn: () => api("/v1/admin/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(["session"], false);
    },
  });
  if (session.isPending)
    return (
      <p className="text-ink-3 p-8" role="status">
        正在检查登录状态…
      </p>
    );
  if (!session.data) return <Login />;
  const View = (tabs.find(([key]) => key === tab) ?? tabs[0])[2];
  return (
    <main className="text-tau-body mx-auto max-w-[1440px] space-y-6 px-5 py-8 md:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tau 产品统计</h1>
          <p className="text-tau-meta text-ink-3 mt-2">
            产品 tau-desktop · 上海自然日 · 指标版本 2
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["analytics"] })}
          >
            刷新
          </Button>
          <Button variant="ghost" loading={logout.isPending} onClick={() => logout.mutate()}>
            退出
          </Button>
        </div>
      </header>
      {logout.isError && (
        <p role="alert" className="text-danger">
          {logout.error.message}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <label className="space-y-1">
          <span className="text-tau-meta text-ink-3 block">开始日期</span>
          <Input
            type="date"
            value={filters.from}
            max={filters.to}
            onChange={event => setFilters({ ...filters, from: event.target.value })}
          />
        </label>
        <label className="space-y-1">
          <span className="text-tau-meta text-ink-3 block">结束日期</span>
          <Input
            type="date"
            value={filters.to}
            min={filters.from}
            max={localDay()}
            onChange={event => setFilters({ ...filters, to: event.target.value })}
          />
        </label>
        <label className="space-y-1">
          <span className="text-tau-meta text-ink-3 block">环境</span>
          <select
            className="rounded-tau-md bg-surface text-ink-1 h-[34px] px-3"
            value={filters.environment}
            onChange={event => setFilters({ ...filters, environment: event.target.value })}
          >
            <option value="production">正式</option>
            <option value="development">开发</option>
          </select>
        </label>
      </div>
      <nav aria-label="统计页面" className="flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <Button
            key={key}
            variant={key === tab ? "soft" : "ghost"}
            aria-current={key === tab ? "page" : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </nav>
      <View filters={filters} />
    </main>
  );
}
