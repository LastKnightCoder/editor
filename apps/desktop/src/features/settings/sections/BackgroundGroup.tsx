import { useMutation, useQuery } from "@tanstack/react-query";
import { SettingRow, Switch } from "@tau/ui";
import { backendRequest } from "@/commands/plugin-backend";
import { SettingsGroup } from "../components/SettingsGroup";

interface BackgroundPreferences {
  openAtLogin: boolean;
  keepBackground: boolean;
  startHidden: boolean;
  loginStatus: string | null;
  trayAvailable: boolean;
}
export function BackgroundGroup() {
  const query = useQuery({
    queryKey: ["settings", "background"],
    queryFn: () => backendRequest<BackgroundPreferences>("preferences"),
    refetchOnWindowFocus: true,
  });
  const mutation = useMutation({
    mutationFn: (
      patch: Partial<Pick<BackgroundPreferences, "openAtLogin" | "keepBackground" | "startHidden">>
    ) => backendRequest<BackgroundPreferences>("set-preferences", patch),
    onSettled: () => query.refetch(),
  });
  const data = query.data;
  const error = mutation.error ?? query.error;
  return (
    <SettingsGroup title="启动与后台运行">
      {data ? (
        <>
          <SettingRow title="开机自动启动" description="电脑开机后自动启动 Tau">
            <Switch
              aria-label="开机自动启动"
              checked={data.openAtLogin}
              disabled={mutation.isPending}
              onCheckedChange={value => mutation.mutate({ openAtLogin: value })}
            />
          </SettingRow>
          <SettingRow title="启动时不打开窗口" description="开机后 Tau 静默运行，不弹出主界面">
            <Switch
              aria-label="启动时不打开窗口"
              checked={data.startHidden}
              disabled={mutation.isPending}
              onCheckedChange={value => mutation.mutate({ startHidden: value })}
            />
          </SettingRow>
          <SettingRow
            title="关闭窗口时不退出"
            description="窗口关闭后继续在后台运行，可从状态栏图标重新打开"
          >
            <Switch
              aria-label="关闭窗口时不退出"
              checked={data.keepBackground}
              disabled={mutation.isPending}
              onCheckedChange={value => mutation.mutate({ keepBackground: value })}
            />
          </SettingRow>
          {data.loginStatus === "requires-approval" && (
            <p className="text-tau-meta text-warn">请在系统设置中允许 Tau 登录启动。</p>
          )}
          {!data.trayAvailable && (
            <p className="text-tau-meta text-ink-2">系统托盘不可用时不会隐藏最后一个可操作入口。</p>
          )}
        </>
      ) : (
        <p className="text-tau-meta text-ink-2">正在读取后台运行设置…</p>
      )}
      {error && (
        <p role="alert" className="text-tau-meta text-warn">
          {error instanceof Error ? error.message : "设置保存失败"}
        </p>
      )}
    </SettingsGroup>
  );
}
