import { useMutation, useQuery } from "@tanstack/react-query";
import { Switch } from "@tau/ui";
import { backendRequest } from "@/commands/plugin-backend";
import { SettingRow } from "../components/SettingRow";
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
          <SettingRow
            title="登录系统后启动 Tau"
            description="由系统启动应用，插件不能自行添加启动项"
          >
            <Switch
              aria-label="登录系统后启动 Tau"
              checked={data.openAtLogin}
              disabled={mutation.isPending}
              onCheckedChange={value => mutation.mutate({ openAtLogin: value })}
            />
          </SettingRow>
          <SettingRow
            title="登录后在后台运行"
            description="不打开主窗口；仅启动已授权、声明自动启动的后台"
          >
            <Switch
              aria-label="登录后在后台运行"
              checked={data.startHidden}
              disabled={mutation.isPending}
              onCheckedChange={value => mutation.mutate({ startHidden: value })}
            />
          </SettingRow>
          <SettingRow
            title="关闭窗口后保持后台运行"
            description="有插件后台运行时保留托盘，点击退出仍会结束全部后台"
          >
            <Switch
              aria-label="关闭窗口后保持后台运行"
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
