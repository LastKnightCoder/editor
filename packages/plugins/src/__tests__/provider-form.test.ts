import { describe, expect, it } from "vitest";
import { definePlugin, type PluginContext, type ProviderForm } from "../index";
import { createMemoryStorage, PluginHost } from "../host";
import {
  assertProviderForm,
  isProviderFieldError,
  isProviderFieldVisible,
  isProviderFormComplete,
  ProviderFieldError,
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

describe("开关字段、字段错误与分组链接", () => {
  const toggles: ProviderForm = {
    groups: [
      {
        title: "选项",
        link: { label: "控制台", url: "https://example.com" },
        fields: [
          { key: "stream", label: "流式返回", type: "switch", default: true },
          { key: "verbose", label: "详细日志", type: "switch" },
        ],
      },
    ],
  };

  it("开关取值读成字符串，缺省取 default，且不参与必填校验", () => {
    expect(readProviderFormValues(toggles, undefined)).toEqual({
      stream: "true",
      verbose: "false",
    });
    expect(readProviderFormValues(toggles, { stream: false, verbose: "true" })).toEqual({
      stream: "false",
      verbose: "true",
    });
    expect(validateProviderFormValues(toggles, { stream: "", verbose: "" })).toEqual({});
  });

  it("拒绝非 https 链接与开关摘要", () => {
    expect(() => assertProviderForm(toggles)).not.toThrow();
    expect(() =>
      assertProviderForm({
        groups: [{ ...toggles.groups[0], link: { label: "控制台", url: "http://x" } }],
      })
    ).toThrow("链接");
    expect(() =>
      assertProviderForm({
        groups: [{ title: "g", fields: [{ key: "s", label: "S", type: "switch", summary: true }] }],
      })
    ).toThrow("摘要");
  });

  it("字段错误按名称识别，跨模块副本也能识别", () => {
    expect(isProviderFieldError(new ProviderFieldError("apiKey", "无效"))).toBe(true);
    const copy = Object.assign(new Error("无效"), { name: "ProviderFieldError", key: "apiKey" });
    expect(isProviderFieldError(copy)).toBe(true);
    expect(isProviderFieldError(new Error("x"))).toBe(false);
  });
});

describe("宿主服务选择与条件显示", () => {
  const publish: ProviderForm = {
    groups: [
      {
        title: "推送",
        fields: [
          { key: "useGitCli", label: "Git Push", type: "switch", default: true },
          {
            key: "cacheId",
            label: "缓存目录",
            type: "service-choice",
            service: "git.cacheDirectory",
            labelKey: "cacheLabel",
            placeholder: "应用缓存目录（默认）",
            visibleWhen: { key: "useGitCli", equals: "true" },
          },
          {
            key: "apiRoot",
            label: "API 地址",
            type: "url",
            visibleWhen: { key: "useGitCli", equals: "false" },
          },
        ],
      },
    ],
  };

  it("服务选择同时读出标识与显示名，留空不算缺失", () => {
    expect(assertProviderForm(publish)).toBeUndefined();
    const values = readProviderFormValues(publish, { cacheId: "c1", cacheLabel: "~/cache" });
    expect(values).toMatchObject({ cacheId: "c1", cacheLabel: "~/cache", useGitCli: "true" });
    expect(readProviderFormValues(publish, {}).cacheLabel).toBe("");
    expect(mergeProviderFormValues({ token: "t" }, values)).toMatchObject({
      token: "t",
      cacheId: "c1",
      cacheLabel: "~/cache",
    });
  });

  it("隐藏字段不参与必填校验", () => {
    const shown = readProviderFormValues(publish, { useGitCli: false });
    expect(isProviderFieldVisible(publish.groups[0].fields[2], shown)).toBe(true);
    expect(validateProviderFormValues(publish, shown)).toEqual({ apiRoot: "请填写API 地址" });
    const hidden = readProviderFormValues(publish, { useGitCli: true });
    expect(isProviderFieldVisible(publish.groups[0].fields[2], hidden)).toBe(false);
    expect(validateProviderFormValues(publish, hidden)).toEqual({});
  });

  it("拒绝未知服务、缺失或冲突的 labelKey 与悬空显示条件", () => {
    const field = publish.groups[0].fields[1];
    const form = (next: object) => ({
      groups: [{ title: "g", fields: [publish.groups[0].fields[0], { ...field, ...next }] }],
    });
    expect(() => assertProviderForm(form({ service: "fs.any" }) as ProviderForm)).toThrow(
      "宿主服务"
    );
    expect(() => assertProviderForm(form({ labelKey: "cacheId" }) as ProviderForm)).toThrow(
      "labelKey"
    );
    expect(() => assertProviderForm(form({ labelKey: "useGitCli" }) as ProviderForm)).toThrow(
      "labelKey"
    );
    expect(() =>
      assertProviderForm(form({ visibleWhen: { key: "nope", equals: "x" } }) as ProviderForm)
    ).toThrow("显示条件");
  });
});

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

  it("提供方均可声明 form；普通设置不能使用 form", async () => {
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
    for (const target of ["tts", "asr", "images", "video", "publish"] as const)
      expect(() =>
        context.settings.register({ id: target, title: target, target, form })
      ).not.toThrow();
    expect(() => context.settings.register({ id: "plain", title: "普通", form } as never)).toThrow(
      "目标"
    );
    expect(() =>
      context.settings.register({ id: "sync", title: "同步", target: "sync", form })
    ).not.toThrow();
    await host.dispose();
  });
});
