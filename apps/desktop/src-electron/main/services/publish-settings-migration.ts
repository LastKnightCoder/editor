import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

type Settings = Record<string, any>;
const record = (value: unknown): Settings =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

export function assertCurrentPublishSettings(setting: Settings) {
  const integration = record(setting.integration);
  const publish = record(setting.publish);
  if (
    ["github", "s3"].some(key => Object.hasOwn(integration, key) || Object.hasOwn(publish, key)) ||
    (publish.active !== undefined && !["local", "plugin"].includes(publish.active))
  )
    throw new Error("旧发布设置已退役，请重新加载应用设置后保存");
}

/** 旧物理目标身份保持原样，发布账本无需改名，升级只原子提交设置。 */
export async function migratePublishSettings(
  setting: Settings,
  appDir: string,
  save: (next: Settings) => Promise<void>,
  registerDirectory: (directory: string) => Promise<{ id: string; label: string }>
): Promise<Settings> {
  const integration = record(setting.integration);
  const publish = record(setting.publish);
  const legacy = ["github", "s3"].filter(
    key => Object.hasOwn(integration, key) || Object.hasOwn(publish, key) || publish.active === key
  );
  if (!legacy.length) return setting;
  const source = JSON.stringify(setting, null, 2);
  const backup = join(
    appDir,
    "setting.json.publish-" + createHash("sha256").update(source).digest("hex") + ".bak"
  );
  await writeFile(backup, source, { flag: "wx", mode: 0o600 }).catch(error => {
    if (error.code !== "EEXIST") throw error;
  });
  const configurations = { ...record(record(publish.plugin).configurations) };
  for (const key of legacy) {
    const id = "tau.publish-" + key;
    if (Object.hasOwn(configurations, id)) continue;
    const target = record(publish[key]);
    const account = record(integration[key]);
    if (key === "github") {
      const user = record(account.user);
      const cache = target.gitWorkingDir
        ? await registerDirectory(text(target.gitWorkingDir))
        : undefined;
      configurations[id] = {
        token: text(account.token),
        repo: text(target.repo),
        branch: text(target.branch, "gh-pages"),
        committerName: text(user.name),
        committerEmail: text(user.email),
        basePath: text(target.basePath, "/"),
        useGitCli: target.useGitCli !== false,
        ...(cache ? { cacheId: cache.id, cacheLabel: cache.label } : {}),
      };
    } else
      configurations[id] = {
        accessKeyId: text(account.accessKeyId),
        secretAccessKey: text(account.secretAccessKey),
        endpoint: text(account.endpoint),
        urlStyle: text(account.urlStyle, "path"),
        bucket: text(target.bucket),
        region: text(target.region),
        pathPrefix: text(target.path),
        basePath: text(target.basePath, "/"),
      };
  }
  const nextIntegration = { ...integration };
  const nextPublish = { ...publish };
  for (const key of ["github", "s3"]) {
    delete nextIntegration[key];
    delete nextPublish[key];
  }
  const selected = ["github", "s3"].includes(publish.active)
    ? "tau.publish-" + publish.active
    : undefined;
  const next = {
    ...setting,
    integration: nextIntegration,
    publish: {
      ...nextPublish,
      active: selected ? "plugin" : (publish.active ?? "local"),
      plugin: {
        ...record(publish.plugin),
        id: selected ?? record(publish.plugin).id ?? "",
        configurations,
      },
    },
  };
  assertCurrentPublishSettings(next);
  await save(next);
  return next;
}
