/* eslint-disable react-refresh/only-export-components -- 夹具导出运行时工厂。 */
import { ConfigurationPanel } from "@tau/ui";
import { vi } from "vitest";
import { definePlugin, type PluginSettingsProps } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { MobilePluginRuntime } from "../../../app/plugins/runtime";

const providers = [
  ["s3", "S3 兼容存储"],
  ["oss", "阿里云 OSS"],
  ["github", "GitHub 仓库"],
  ["webdav", "WebDAV"],
] as const;

function Settings(props: PluginSettingsProps) {
  const config = props.syncConfig ?? props.uploadConfig;
  const value = config?.value;
  if (!config || !value || typeof value !== "object" || Array.isArray(value))
    return <p>配置此服务</p>;
  return (
    <div>
      <ConfigurationPanel
        initialValue={Object.fromEntries(
          Object.entries(value).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        )}
        accountFields={[{ key: "token", label: "Token", type: "password" }]}
        fields={[]}
        onSave={next => config.save(next)}
      />
      <p>{String(value.owner ?? "")}</p>
      {props.uploadConfig && value.repo && (
        <p>
          https://raw.githubusercontent.com/{String(value.owner)}/{String(value.repo)}/
          {String(value.branch)}/uploads/photo_example.webp
        </p>
      )}
    </div>
  );
}

export async function createStorageRuntime() {
  const runtime = new MobilePluginRuntime(
    createPluginEnvironmentStore({
      platform: "android",
      input: { coarsePointer: true, finePointer: false },
    }),
    createMemoryStorage(),
    "data.db",
    { push: vi.fn() },
    "0.2.3"
  );
  for (const [key, name] of providers) {
    for (const target of ["sync", "upload"] as const) {
      const id = `tau.${target}-${key}`;
      runtime.host.registerTrusted(
        definePlugin({
          id,
          name,
          version: "1.0.0",
          create: () => ({
            activate(context) {
              if (target === "sync")
                context.sync.register({
                  id,
                  name,
                  create: () => ({
                    uploadFile: async () => true,
                    downloadFile: async () => new Uint8Array(),
                    fileExists: async () => false,
                    listFiles: async () => [],
                    createFileIfAbsent: async () => true,
                  }),
                });
              else
                context.upload.register({
                  id,
                  name,
                  upload: async () => "https://example.com/file",
                });
              context.settings.register({ id: target, title: name, target, component: Settings });
            },
          }),
        })
      );
      await runtime.host.enable(id);
    }
  }
  return runtime;
}
