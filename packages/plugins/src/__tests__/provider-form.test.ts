import { describe, expect, it } from "vitest";
import { definePlugin, type PluginContext, type ProviderForm } from "../index";
import { createMemoryStorage, PluginHost } from "../host";
import {
  assertProviderForm,
  isProviderFormComplete,
  mergeProviderFormValues,
  patchProviderFormValues,
  providerFormSummary,
  readProviderFormValues,
  validateProviderFormValues,
} from "../provider-form";

const form: ProviderForm = {
  groups: [
    {
      title: "账号",
      fields: [{ key: "token", label: "令牌", type: "secret" }],
    },
    {
      title: "存储位置",
      fields: [
        { key: "repo", label: "仓库", type: "remote-choice", load: async () => [], summary: true },
        {
          key: "branch",
          label: "分支",
          type: "remote-choice",
          load: async () => [],
          dependsOn: ["repo"],
          summary: true,
        },
        {
          key: "mode",
          label: "地址模式",
          type: "choice",
          default: "path",
          options: [{ value: "path", label: "路径模式" }, { value: "host" }],
        },
        { key: "prefix", label: "目录", type: "text", optional: true },
      ],
    },
  ],
};

describe("存储提供方表单", () => {
  it("读取初值只取声明字段的字符串，choice 缺省取 default", () => {
    expect(readProviderFormValues(form, { token: "t", repo: 1, extra: "x" })).toEqual({
      token: "t",
      repo: "",
      branch: "",
      mode: "path",
      prefix: "",
    });
    expect(readProviderFormValues(form, undefined).mode).toBe("path");
  });

  it("依赖字段链式清空，值未变化时不清空", () => {
    const values = { token: "t", repo: "a", branch: "main", mode: "path", prefix: "" };
    expect(patchProviderFormValues(form, values, "repo", "b").branch).toBe("");
    expect(patchProviderFormValues(form, values, "repo", "a").branch).toBe("main");
    expect(patchProviderFormValues(form, values, "token", "u").branch).toBe("main");
  });

  it("必填校验、完整性与摘要", () => {
    const values = readProviderFormValues(form, { token: "t", repo: "notes", mode: "host" });
    expect(validateProviderFormValues(form, values)).toEqual({ branch: "请填写分支" });
    expect(isProviderFormComplete(form, undefined)).toBe(false);
    expect(isProviderFormComplete(form, { token: "t", repo: "r", branch: "main" })).toBe(true);
    expect(providerFormSummary(form, { token: "t", repo: "notes", branch: " main " })).toBe(
      "notes · main"
    );
  });

  it("写回时保留未声明的键", () => {
    expect(mergeProviderFormValues({ legacy: 1, token: "old" }, { token: "new" })).toEqual({
      legacy: 1,
      token: "new",
    });
  });

  it("拒绝无分组、重复 key、密钥摘要与悬空依赖", () => {
    expect(() => assertProviderForm({ groups: [] })).toThrow("分组");
    const field = { key: "a", label: "A", type: "text" } as const;
    expect(() => assertProviderForm({ groups: [{ title: "g", fields: [field, field] }] })).toThrow(
      "重复"
    );
    expect(() =>
      assertProviderForm({
        groups: [{ title: "g", fields: [{ key: "s", label: "S", type: "secret", summary: true }] }],
      })
    ).toThrow("摘要");
    expect(() =>
      assertProviderForm({
        groups: [
          {
            title: "g",
            fields: [
              {
                key: "r",
                label: "R",
                type: "remote-choice",
                load: async () => [],
                dependsOn: ["x"],
              },
            ],
          },
        ],
      })
    ).toThrow("依赖");
    expect(() => assertProviderForm(form)).not.toThrow();
  });

  it("form 只用于 sync / upload；旧版组件式存储设置仍可注册，由宿主决定不渲染", async () => {
    const host = new PluginHost({
      workspaceId: "A",
      storage: createMemoryStorage(),
      settings: { register: () => ({ id: "x", open: async () => undefined, dispose: () => {} }) },
    });
    let context!: PluginContext;
    host.registerTrusted(
      definePlugin({
        id: "example",
        name: "示例",
        version: "1",
        create: () => ({
          activate(ctx) {
            context = ctx;
          },
        }),
      })
    );
    await host.enable("example");
    const legacy = { id: "old", title: "同步", target: "sync", component: () => null };
    expect(() => context.settings.register(legacy as never)).not.toThrow();
    expect(() => context.settings.register({ ...legacy, id: "both", form } as never)).toThrow(
      "同时"
    );
    expect(() =>
      context.settings.register({ id: "tts", title: "语音", target: "tts", form } as never)
    ).toThrow("只用于");
    expect(() =>
      context.settings.register({ id: "sync", title: "同步", target: "sync", form })
    ).not.toThrow();
    await host.dispose();
  });
});
