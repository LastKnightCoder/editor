import { vi } from "vitest";
import { definePlugin, type ProviderForm } from "@tau/plugins";
import { createMemoryStorage } from "@tau/plugins/host";
import { createPluginEnvironmentStore } from "@tau/plugins/environment-host";
import { MobilePluginRuntime } from "../../../app/plugins/runtime";

const providers = [
  ["s3", "S3 兼容存储"],
  ["oss", "阿里云 OSS"],
  ["github", "GitHub 仓库"],
  ["webdav", "WebDAV"],
] as const;

const forms: Record<(typeof providers)[number][0], ProviderForm> = {
  s3: {
    groups: [
      {
        title: "账号",
        fields: [
          { key: "accessKeyId", label: "Access Key ID", type: "text" },
          { key: "secretAccessKey", label: "Secret Access Key", type: "secret" },
        ],
      },
      {
        title: "存储位置",
        fields: [
          { key: "bucket", label: "Bucket", type: "text", summary: true },
          { key: "region", label: "区域", type: "text", summary: true },
          {
            key: "urlStyle",
            label: "地址模式",
            type: "choice",
            default: "path",
            options: [
              { value: "path", label: "路径模式" },
              { value: "virtualHosted", label: "虚拟主机模式" },
            ],
          },
        ],
      },
    ],
  },
  oss: {
    groups: [
      {
        title: "账号",
        fields: [{ key: "accessKeySecret", label: "AccessKey Secret", type: "secret" }],
      },
      {
        title: "存储位置",
        fields: [{ key: "bucket", label: "Bucket", type: "text", summary: true }],
      },
    ],
  },
  github: {
    groups: [
      { title: "账号", fields: [{ key: "token", label: "访问令牌", type: "secret" }] },
      {
        title: "存储位置",
        fields: [
          { key: "owner", label: "仓库所有者", type: "text", summary: true },
          {
            key: "repo",
            label: "仓库",
            type: "remote-choice",
            summary: true,
            load: async () => [{ value: "tau-data" }, { value: "tau-assets" }],
          },
          {
            key: "branch",
            label: "分支",
            type: "remote-choice",
            dependsOn: ["repo"],
            load: async () => [{ value: "main" }],
          },
          { key: "pathPrefix", label: "目录", type: "text", optional: true },
        ],
      },
    ],
  },
  webdav: {
    groups: [
      {
        title: "账号",
        fields: [
          { key: "url", label: "服务地址", type: "url", summary: true },
          { key: "password", label: "密码", type: "secret" },
        ],
      },
    ],
  },
};

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
    const form = forms[key];
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
              context.settings.register({ id: target, title: name, target, form });
            },
          }),
        })
      );
      await runtime.host.enable(id);
    }
  }
  return runtime;
}
