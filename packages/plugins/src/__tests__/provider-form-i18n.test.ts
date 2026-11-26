import { expect, it } from "vitest";
import { createI18nRuntime, createLocaleStore, defineI18n, type DisplayText } from "@tau/i18n";
import {
  mergeProviderFormValues,
  providerFormSummary,
  readProviderFormValues,
  type ProviderFieldGroup,
  type ProviderFormDeclaration,
  type ProviderRemoteChoiceField,
  type ProviderChoiceOption,
} from "../provider-form";
import { resolveProviderForm } from "../provider-form-i18n";

function owner(prefix: string) {
  const locale = createLocaleStore("zh-CN");
  const messages = defineI18n({
    fallbackLocale: "zh-CN",
    resources: {
      "zh-CN": {
        group: `${prefix}/cn/group`,
        label: `${prefix}/cn/label`,
        option: `${prefix}/cn/option`,
        remote: `${prefix}/cn/{{name}}`,
      },
      "zh-TW": {
        group: `${prefix}/tw/group`,
        label: `${prefix}/tw/label`,
        option: `${prefix}/tw/option`,
        remote: `${prefix}/tw/{{name}}`,
      },
      "en-US": {
        group: `${prefix}/en/group`,
        label: `${prefix}/en/label`,
        option: `${prefix}/en/option`,
        remote: `${prefix}/en/{{name}}`,
      },
    },
  });
  const runtime = createI18nRuntime({ localeSource: locale });
  return { locale, messages, runtime, resolve: runtime.get(messages).resolve };
}

it("同一声明按所属插件解析，换语保留视图与业务值，摘要只变化显示标签", () => {
  const first = owner("first"),
    second = owner("second");
  const declaration: ProviderFormDeclaration = {
    groups: [
      {
        title: first.messages.ref("group"),
        description: first.messages.ref("label"),
        link: { label: first.messages.ref("label"), url: "https://example.com/raw?x=1" },
        fields: [
          {
            key: "mode",
            type: "choice",
            label: first.messages.ref("label"),
            description: first.messages.ref("label"),
            placeholder: first.messages.ref("label"),
            default: "raw-id",
            summary: true,
            options: [
              {
                value: "raw-id",
                label: first.messages.ref("option"),
                description: first.messages.ref("label"),
              },
            ],
          },
        ],
      },
    ],
  };
  try {
    const view = resolveProviderForm(declaration, first.resolve),
      other = resolveProviderForm(declaration, second.resolve);
    const groups = view.groups,
      group = groups[0],
      field = group.fields[0];
    if (field.type !== "choice") throw new Error("Expected choice field");
    const options = field.options,
      stored = { mode: "raw-id", legacy: { keep: true } };
    for (const [locale, language] of [
      ["zh-TW", "tw"],
      ["en-US", "en"],
    ]) {
      first.locale.setLocale(locale);
      second.locale.setLocale(locale);
      expect(view.groups).toBe(groups);
      expect(view.groups[0]).toBe(group);
      expect(group.fields[0]).toBe(field);
      expect(field.options).toBe(options);
      expect(group.title).toBe(`first/${language}/group`);
      expect(other.groups[0].title).toBe(`second/${language}/group`);
      expect(group.description).toBe(`first/${language}/label`);
      expect(group.link?.label).toBe(`first/${language}/label`);
      expect(field.label).toBe(`first/${language}/label`);
      expect(field.description).toBe(`first/${language}/label`);
      expect(field.placeholder).toBe(`first/${language}/label`);
      expect(options[0].description).toBe(`first/${language}/label`);
      expect(group.link?.url).toBe("https://example.com/raw?x=1");
      expect(field.key).toBe("mode");
      expect(field.default).toBe("raw-id");
      expect(options[0].value).toBe("raw-id");
      expect(providerFormSummary(view, stored)).toBe(`first/${language}/option`);
      expect(mergeProviderFormValues(stored, readProviderFormValues(view, stored))).toEqual(stored);
    }
    expect(declaration.groups[0].title).toEqual(first.messages.ref("group"));
  } finally {
    first.runtime.dispose();
    second.runtime.dispose();
  }
});

it("保留字符串getter的原始receiver与动态读取，不提前读取可选getter", () => {
  const current = { language: "first", titles: 0, placeholders: 0 };
  class Field {
    type = "text" as const;
    key = "raw-key";
    #prefix = "original";
    get label() {
      return `${this.#prefix}/${current.language}`;
    }
    get placeholder() {
      current.placeholders++;
      return "";
    }
  }
  class Group implements ProviderFieldGroup<DisplayText> {
    fields = [new Field()];
    #prefix = "group";
    get title() {
      current.titles++;
      return `${this.#prefix}/${current.language}`;
    }
  }
  const source = new Group(),
    view = resolveProviderForm({ groups: [source] }, value => {
      if (typeof value !== "string") throw new Error("Unexpected reference");
      return value;
    });
  expect(current.titles).toBe(1);
  expect(current.placeholders).toBe(0);
  expect(view.groups[0].fields[0].placeholder).toBe("");
  current.language = "next";
  expect(view.groups[0].title).toBe("group/next");
  expect(view.groups[0].fields[0].label).toBe("original/next");
  expect(source.fields[0].key).toBe("raw-key");
});

it("beforeSave调用原始receiver并保留同步抛错和原Promise", async () => {
  const values = { token: "raw-value" },
    signal = new AbortController().signal,
    pending = Promise.resolve(values);
  const observations: [unknown, object, AbortSignal][] = [],
    failure = new Error("RAW_FAILURE");
  let reject = false;
  const source: ProviderFormDeclaration & { marker: string } = {
    marker: "original-owner",
    groups: [{ title: "group", fields: [{ key: "token", type: "text", label: "token" }] }],
    beforeSave(input, incoming) {
      observations.push([this, input, incoming]);
      if (reject) throw failure;
      return pending;
    },
  };
  const view = resolveProviderForm(source, value => String(value)),
    save = view.beforeSave;
  if (!save) throw new Error("Save callback missing");
  expect(observations).toEqual([]);
  expect(view.beforeSave).toBe(save);
  expect(save(values, signal)).toBe(pending);
  expect(observations).toHaveLength(1);
  expect(observations[0][0]).toBe(source);
  expect(observations[0][1]).toBe(values);
  expect(observations[0][2]).toBe(signal);
  expect(await pending).toEqual(values);
  reject = true;
  expect(() => save(values, signal)).toThrow(failure);
});

it("远程加载只由调用触发，选项在到达后换语且快照静态引用参数", async () => {
  const plugin = owner("plugin"),
    values = { token: "raw" },
    signal = new AbortController().signal;
  let finish!: (options: readonly ProviderChoiceOption<DisplayText>[]) => void;
  const pending = new Promise<readonly ProviderChoiceOption<DisplayText>[]>(resolve => {
      finish = resolve;
    }),
    observations: [unknown, object, AbortSignal][] = [];
  const source: ProviderRemoteChoiceField<DisplayText> = {
    type: "remote-choice",
    key: "remote",
    label: "remote",
    dependsOn: ["token"],
    load(input, incoming) {
      observations.push([this, input, incoming]);
      return pending;
    },
  };
  try {
    const view = resolveProviderForm(
        {
          groups: [
            { title: "group", fields: [{ type: "secret", key: "token", label: "token" }, source] },
          ],
        },
        plugin.resolve
      ),
      field = view.groups[0].fields[1];
    if (field.type !== "remote-choice") throw new Error("Expected remote choice field");
    const load = field.load;
    expect(observations).toEqual([]);
    const loading = load(values, signal);
    expect(observations).toHaveLength(1);
    expect(observations[0][0]).toBe(source);
    expect(observations[0][1]).toBe(values);
    expect(observations[0][2]).toBe(signal);
    plugin.locale.setLocale("en-US");
    expect(field.load).toBe(load);
    const reference = { kind: "i18n" as const, key: "remote", values: { name: "original" } };
    finish([{ value: "raw-option-id", label: reference }]);
    const options = await loading;
    reference.values.name = "changed-after-load";
    expect(options[0].label).toBe("plugin/en/original");
    plugin.locale.setLocale("zh-TW");
    expect(options[0].label).toBe("plugin/tw/original");
    expect(options[0].value).toBe("raw-option-id");
    const failure = new Error("SYNC_LOAD_FAILURE");
    const throwing = resolveProviderForm(
      {
        groups: [
          {
            title: "group",
            fields: [
              {
                key: "x",
                label: "x",
                type: "remote-choice",
                load() {
                  throw failure;
                },
              },
            ],
          },
        ],
      },
      plugin.resolve
    ).groups[0].fields[0];
    if (throwing.type !== "remote-choice") throw new Error("Expected remote choice field");
    let caught: unknown;
    try {
      throwing.load(values, signal);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(failure);
    expect(field.dependsOn).toEqual(["token"]);
    expect(observations).toHaveLength(1);
    expect(observations[0][0]).toBe(source);
    expect(observations[0][1]).toBe(values);
    expect(observations[0][2]).toBe(signal);
  } finally {
    plugin.runtime.dispose();
  }
});

it("真实宿主只读取一次表单声明，换语保留登记与已加载选项", async () => {
  const { createPluginEnvironmentStore } = await import("../environment");
  const { PluginHost, createMemoryStorage } = await import("../host");
  const { definePlugin } = await import("../index");
  const environment = createPluginEnvironmentStore({
    platform: "desktop",
    locale: "zh-CN",
    input: { coarsePointer: false, finePointer: true },
  });
  const messages = defineI18n({
    fallbackLocale: "zh-CN",
    resources: {
      "zh-CN": { group: "cn/group", label: "cn/field", remote: "cn/{{name}}" },
      "zh-TW": { group: "tw/group", label: "tw/field", remote: "tw/{{name}}" },
      "en-US": { group: "en/group", label: "en/field", remote: "en/{{name}}" },
    },
  });
  let registered: import("../settings").PluginSettingsDefinition | undefined;
  let declarations = 0,
    registrations = 0,
    activations = 0,
    loads = 0;
  const declaration: ProviderFormDeclaration = {
    groups: [
      {
        title: messages.ref("group"),
        fields: [
          {
            type: "remote-choice",
            key: "branch-id",
            label: messages.ref("label"),
            async load() {
              loads++;
              return [{ value: "raw-main", label: messages.ref("remote", { name: "main" }) }];
            },
          },
        ],
      },
    ],
  };
  const host = new PluginHost({
    workspaceId: "work",
    storage: createMemoryStorage(),
    environmentSource: environment,
    settings: {
      register(_context, definition) {
        registered = definition;
        registrations++;
        return { id: definition.id, open: async () => undefined, dispose() {} };
      },
    },
  });
  host.registerTrusted(
    definePlugin({
      id: "localized-form",
      name: "raw plugin",
      version: "1.0.0",
      i18n: messages,
      create: () => ({
        activate(context) {
          activations++;
          context.settings.register({
            id: "settings",
            target: "publish",
            title: messages.ref("group"),
            get form() {
              declarations++;
              return declaration;
            },
          });
        },
      }),
    })
  );
  try {
    await host.enable("localized-form");
    if (!registered?.form) throw new Error("未登记提供方表单");
    const definition = registered,
      form = registered.form,
      group = form.groups[0],
      field = group.fields[0];
    if (field.type !== "remote-choice") throw new Error("远程选项声明丢失");
    const options = await field.load({}, new AbortController().signal);
    expect([definition.title, group.title, field.label, options[0].label]).toEqual([
      "cn/group",
      "cn/group",
      "cn/field",
      "cn/main",
    ]);
    for (const [locale, prefix] of [
      ["zh-TW", "tw"],
      ["en-US", "en"],
    ] as const) {
      environment.update({ locale });
      expect(registered).toBe(definition);
      expect(registered.form).toBe(form);
      expect(form.groups[0]).toBe(group);
      expect(group.fields[0]).toBe(field);
      expect([definition.title, group.title, field.label, options[0].label]).toEqual([
        `${prefix}/group`,
        `${prefix}/group`,
        `${prefix}/field`,
        `${prefix}/main`,
      ]);
      expect(options[0].value).toBe("raw-main");
      expect(field.key).toBe("branch-id");
      expect([activations, registrations, declarations, loads]).toEqual([1, 1, 1, 1]);
    }
  } finally {
    await host.dispose();
  }
});
