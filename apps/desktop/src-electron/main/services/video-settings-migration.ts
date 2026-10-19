import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

type Settings = Record<string, unknown>;
const record = (value: unknown): Settings =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Settings) : {};
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Bilibili 凭据与 YouTube 代理迁入同名视频插件配置；不安装或启用插件，已有新配置不覆盖。 */
export async function migrateVideoSettings(
  setting: Settings,
  appDir: string,
  save: (next: Settings) => Promise<void>
): Promise<Settings> {
  const integration = record(setting.integration);
  if (!Object.hasOwn(integration, "bilibili") && !Object.hasOwn(integration, "youtube"))
    return setting;
  await writeFile(
    join(appDir, `setting.json.video-${randomUUID()}.bak`),
    JSON.stringify(setting, null, 2),
    { flag: "wx", mode: 0o600 }
  );
  const onlineVideo = record(setting.onlineVideo);
  const configurations = { ...record(onlineVideo.configurations) };
  const bilibili = record(integration.bilibili);
  const credentials = record(bilibili.credentials);
  const user = record(bilibili.userInfo);
  if (text(credentials.SESSDATA) && !Object.hasOwn(configurations, "bilibili"))
    configurations.bilibili = {
      SESSDATA: text(credentials.SESSDATA),
      bfe_id: text(credentials.bfe_id),
      ...(user.isLogin
        ? {
            user: {
              name: text(user.name),
              avatar: text(user.avatar),
              vipStatus: typeof user.vipStatus === "number" ? user.vipStatus : 0,
            },
          }
        : {}),
    };
  const proxy = text(record(integration.youtube).proxy);
  if (proxy && !Object.hasOwn(configurations, "youtube")) configurations.youtube = { proxy };
  const { bilibili: _bilibili, youtube: _youtube, ...rest } = integration;
  const next = {
    ...setting,
    integration: rest,
    onlineVideo: { ...onlineVideo, configurations },
  };
  await save(next);
  return next;
}
