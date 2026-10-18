import path from "node:path";
import { LocalPluginPreferences } from "@tau/plugins/local-state";

type Settings = Record<string, unknown>;
const record = (value: unknown): Settings =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Settings) : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");

/** 同步迁移先消费共享旧凭据，上传迁移随后移除已退役的图床配置。 */
export async function migrateUploadSettings(
  setting: Settings,
  appDir: string,
  save: (next: Settings) => Promise<void>
): Promise<Settings> {
  const imageBed = record(setting.imageBed);
  const integration = record(setting.integration);
  const plugin = record(imageBed.plugin);
  const github = record(imageBed.github);
  const oss = record(imageBed.aliOSS);
  const s3 = record(imageBed.s3);
  const githubAccount = record(integration.github);
  const githubUser = record(githubAccount.user);
  const ossAccount = record(integration.aliOSS);
  const s3Account = record(integration.s3);
  const legacyKeys = ["github", "aliOSS", "s3", "webdav", "local"];
  if (
    !legacyKeys.some(key => Object.hasOwn(imageBed, key)) &&
    !Object.hasOwn(integration, "aliOSS") &&
    !Object.hasOwn(integration, "webdav") &&
    (!imageBed.active || ["local", "plugin"].includes(text(imageBed.active)))
  )
    return setting;
  const configurations = { ...record(plugin.configurations) };
  const targets: { key: string; id: string; fields: string[]; config: Record<string, string> }[] = [
    {
      key: "github",
      id: "tau.upload-github",
      fields: ["token", "owner", "repo", "branch"],
      config: {
        token: text(githubAccount.token),
        owner: text(githubUser.name),
        email: text(githubUser.email),
        repo: text(github.repo),
        branch: text(github.branch),
        // 旧GitHub上传没有使用路径前缀和CDN字段，保留实际的根目录与原始地址行为。
        pathPrefix: "",
        publicBaseUrl: "",
      },
    },
    {
      key: "aliOSS",
      id: "tau.upload-oss",
      fields: ["accessKeyId", "accessKeySecret", "bucket", "region"],
      config: {
        accessKeyId: text(ossAccount.accessKeyId),
        accessKeySecret: text(ossAccount.accessKeySecret),
        bucket: text(oss.bucket),
        region: text(oss.region),
        pathPrefix: text(oss.pathPrefix),
        publicBaseUrl: "",
      },
    },
    {
      key: "s3",
      id: "tau.upload-s3",
      fields: ["accessKeyId", "secretAccessKey", "bucket", "region"],
      config: {
        accessKeyId: text(s3Account.accessKeyId),
        secretAccessKey: text(s3Account.secretAccessKey),
        endpoint: text(s3Account.endpoint),
        urlStyle: text(s3Account.urlStyle) || "path",
        bucket: text(s3.bucket),
        region: text(s3.region),
        pathPrefix: text(s3.pathPrefix),
        publicBaseUrl: "",
      },
    },
  ];
  const configured = targets.filter(target =>
    target.fields.every(field => Boolean(target.config[field]))
  );
  for (const target of configured)
    if (!Object.hasOwn(configurations, target.id)) configurations[target.id] = target.config;
  const selected = configured.find(target => target.key === imageBed.active);
  const nextImageBed = { ...imageBed };
  nextImageBed.githubCdn = imageBed.githubCdn ?? github.cdn ?? null;
  for (const key of legacyKeys) delete nextImageBed[key];
  nextImageBed.active = imageBed.active === "plugin" ? "plugin" : selected ? "plugin" : "local";
  if (selected || Object.keys(configurations).length)
    nextImageBed.plugin = {
      ...plugin,
      id: selected?.id ?? plugin.id ?? "",
      configurations,
    };
  const nextIntegration = { ...integration };
  delete nextIntegration.webdav;
  delete nextIntegration.aliOSS;
  const next = { ...setting, imageBed: nextImageBed, integration: nextIntegration };
  if (selected) {
    const preferences = new LocalPluginPreferences(path.join(appDir, "plugins"));
    await preferences.load();
    await preferences.initialize({ [selected.id]: true });
  }
  await save(next);
  return next;
}
