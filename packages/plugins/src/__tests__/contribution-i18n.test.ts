import { expect, it } from "vitest";
import {
  defineI18n,
  definePlugin,
  type PluginActionDefinition,
  type PluginNotebookOutputDefinition,
  type PluginSettingsDefinition,
  type PluginSidebarItemState,
} from "../index";
import { PluginHost, createMemoryStorage } from "../host";
import { createPluginEnvironmentStore } from "../environment";

function fixture() {
  const environment = createPluginEnvironmentStore({
    locale: "zh-CN",
    platform: "desktop",
    input: { coarsePointer: false, finePointer: true },
  });
  const actions = new Map<string, PluginActionDefinition>(),
    outputs = new Map<string, PluginNotebookOutputDefinition>(),
    settings = new Map<string, PluginSettingsDefinition>(),
    states = new Map<string, PluginSidebarItemState>();
  const registrations: string[] = [];
  const host = new PluginHost({
    workspaceId: "scope",
    storage: createMemoryStorage(),
    environmentSource: environment,
    actions: {
      register(context, definition) {
        actions.set(context.pluginId, definition);
        registrations.push("action/" + context.pluginId);
        return {
          dispose() {
            return undefined;
          },
        };
      },
    },
    notebooks: {
      registerOutput(context, definition) {
        outputs.set(context.pluginId, definition);
        registrations.push("output/" + context.pluginId);
        return {
          dispose() {
            return undefined;
          },
        };
      },
    },
    settings: {
      register(context, definition) {
        settings.set(context.pluginId, definition);
        registrations.push("settings/" + context.pluginId);
        return {
          id: context.pluginId + "/" + definition.id,
          async open() {
            return undefined;
          },
          dispose() {
            return undefined;
          },
        };
      },
    },
    pages: {
      register(context, definition) {
        return {
          id: context.pluginId + ":" + definition.id,
          async open() {
            return undefined;
          },
          dispose() {
            return undefined;
          },
        };
      },
    },
    sidebar: {
      registerGroup: () => ({
        id: "group",
        dispose() {
          return undefined;
        },
      }),
      registerItem(context) {
        registrations.push("sidebar/" + context.pluginId);
        return {
          update(state) {
            states.set(context.pluginId, state);
            registrations.push("update/" + context.pluginId);
          },
          dispose() {
            return undefined;
          },
        };
      },
    },
  });
  return { environment, actions, outputs, settings, states, registrations, host };
}

it("真实宿主按owner解析既有贡献，换语保留任务、回调与侧栏状态，停用仍阻止旧动作", async () => {
  const test = fixture();
  const activations: string[] = [],
    calls: unknown[] = [],
    phases: string[] = [];
  let finish!: (plan: {
    entity: string;
    title: string;
    instructions: string;
    reminders: string[];
  }) => void;
  const plan = {
    entity: "12",
    title: "原始AI任务标题",
    instructions: "原始AI要求",
    reminders: ["原始AI提醒"],
  };
  for (const id of ["owner.a", "owner.b"]) {
    const messages = defineI18n({
      fallbackLocale: "zh-CN",
      resources: {
        "zh-CN": { label: id + "/cn", description: id + "/cn-description" },
        "zh-TW": { label: id + "/tw", description: id + "/tw-description" },
        "en-US": { label: id + "/en", description: id + "/en-description" },
      },
    });
    test.host.registerTrusted(
      definePlugin({
        id,
        name: id,
        version: "1.0.0",
        i18n: messages,
        create: () => ({
          activate(context) {
            activations.push(id);
            context.actions.register({
              id: "action",
              title: messages.ref("label"),
              targets: ["card"],
              run(target) {
                calls.push(target);
              },
            });
            context.notebooks.registerOutput({
              id: "output",
              kind: "kind",
              title: messages.ref("label"),
              description: messages.ref("description"),
              view: () => null,
              prepare(input) {
                calls.push(input);
                return new Promise(resolve => {
                  finish = resolve;
                });
              },
              async complete(input) {
                calls.push(input);
                input.task.phase("原插件阶段");
              },
            });
            context.settings.register({
              id: "settings",
              title: "设置数据标题",
              description: messages.ref("description"),
              component: () => null,
            });
            const page = context.pages.register({
              id: "page",
              title: "页面原数据",
              component: () => null,
            });
            const item = context.sidebar.registerItem({ id: "item", title: "入口原数据", page });
            const params = { group: "raw-group" };
            item.update({
              badge: 2,
              children: [
                {
                  id: "child",
                  title: "原用户中文组名",
                  params,
                  menu: [
                    {
                      title: messages.ref("label"),
                      run() {
                        calls.push("menu/" + id);
                      },
                    },
                  ],
                },
              ],
              action: {
                title: messages.ref("label"),
                run() {
                  calls.push("add/" + id);
                },
              },
            });
            params.group = "changed-after-update";
          },
        }),
      })
    );
    await test.host.enable(id);
  }
  const action = test.actions.get("owner.a"),
    output = test.outputs.get("owner.a"),
    state = test.states.get("owner.a"),
    setting = test.settings.get("owner.a");
  if (!action || !output || !state || !setting) throw new Error("Missing contributions");
  const registrations = [...test.registrations],
    children = state.children,
    menu = children[0].menu,
    add = state.action;
  if (!menu || !add) throw new Error("Missing sidebar commands");
  const pending = output.prepare({
    notebook: { id: "7", title: "用户标题" },
    resources: [{ id: "r1", name: "用户资料" }],
    userPrompt: "原用户AI要求",
    options: { mode: "raw-option" },
    signal: new AbortController().signal,
  });
  const pendingCalls = calls.length;
  try {
    for (const [locale, marker] of [
      ["en-US", "en"],
      ["zh-TW", "tw"],
    ]) {
      test.environment.update({ locale });
      expect(test.actions.get("owner.a")).toBe(action);
      expect(test.outputs.get("owner.a")).toBe(output);
      expect(test.states.get("owner.a")).toBe(state);
      expect(state.children).toBe(children);
      expect(children[0].menu).toBe(menu);
      expect(state.action).toBe(add);
      expect(action.title).toBe("owner.a/" + marker);
      expect(test.actions.get("owner.b")?.title).toBe("owner.b/" + marker);
      expect(output.title).toBe(action.title);
      expect(output.description).toBe("owner.a/" + marker + "-description");
      expect(setting.description).toBe(output.description);
      expect(menu[0].title).toBe(action.title);
      expect(add.title).toBe(action.title);
      expect(children[0].title).toBe("原用户中文组名");
      expect(children[0].params).toEqual({ group: "raw-group" });
      expect(test.registrations).toEqual(registrations);
      expect(calls).toHaveLength(pendingCalls);
      expect(activations).toEqual(["owner.a", "owner.b"]);
    }
    finish(plan);
    expect(await pending).toEqual(plan);
    expect(calls[0]).toMatchObject({
      userPrompt: "原用户AI要求",
      resources: [{ id: "r1", name: "用户资料" }],
      options: { mode: "raw-option" },
    });
    action.run({ kind: "card", id: "raw-card" });
    menu[0].run();
    add.run();
    await output.complete({
      entity: "12",
      text: "原AI输出正文",
      task: {
        phase: text => phases.push(text),
        progress() {
          return undefined;
        },
      },
      signal: new AbortController().signal,
    });
    expect(phases).toEqual(["原插件阶段"]);
    const count = calls.length;
    await test.host.disable("owner.a");
    expect(() => action.run({ kind: "card", id: "raw-card" })).toThrow();
    expect(() => menu[0].run()).toThrow();
    expect(() => add.run()).toThrow();
    await expect(
      output.complete({
        entity: "12",
        text: "",
        task: {
          phase() {
            return undefined;
          },
          progress() {
            return undefined;
          },
        },
        signal: new AbortController().signal,
      })
    ).rejects.toThrow();
    expect(calls).toHaveLength(count);
  } finally {
    await test.host.dispose();
  }
});

it("旧标题getter仍在原位置读取并快照，设置说明getter延迟读取且保持原view receiver", async () => {
  const test = fixture();
  const reads = { action: 0, output: 0, description: 0, settings: 0, menu: 0, add: 0 };
  const receivers: unknown[] = [];
  let actionSource: object, outputSource: object;
  test.host.registerTrusted(
    definePlugin({
      id: "legacy",
      name: "legacy",
      version: "1.0.0",
      create: () => ({
        activate(context) {
          const action = {
            id: "action",
            get title() {
              expect(this).toBe(actionSource);
              return "action/" + ++reads.action;
            },
            targets: ["card"] as const,
            run() {
              return undefined;
            },
          };
          actionSource = action;
          context.actions.register(action);
          const output = {
            id: "output",
            kind: "kind",
            get title() {
              expect(this).toBe(outputSource);
              return " output/" + ++reads.output + " ";
            },
            get description() {
              expect(this).toBe(outputSource);
              return " description/" + ++reads.description + " ";
            },
            view: () => null,
            async prepare() {
              return { entity: "1", title: "原AI标题", instructions: "原AI要求" };
            },
            async complete() {
              return undefined;
            },
          };
          outputSource = output;
          context.notebooks.registerOutput(output);
          const settingsSource = {
            id: "settings",
            title: "Settings",
            marker: "view-data",
            get description() {
              reads.settings++;
              receivers.push(this);
              return this.marker + "/" + reads.settings;
            },
            component: () => null,
          };
          context.settings.register(settingsSource);
          const page = context.pages.register({ id: "page", title: "Page", component: () => null });
          const item = context.sidebar.registerItem({ id: "item", title: "Item", page });
          const menu = {
            get title() {
              expect(this).toBe(menu);
              return "menu/" + ++reads.menu;
            },
            run() {
              return undefined;
            },
          };
          const add = {
            get title() {
              expect(this).toBe(add);
              return "add/" + ++reads.add;
            },
            run() {
              return undefined;
            },
          };
          item.update({
            children: [{ id: "child", title: "用户原名", params: {}, menu: [menu] }],
            action: add,
          });
        },
      }),
    })
  );
  try {
    await test.host.enable("legacy");
    const action = test.actions.get("legacy"),
      output = test.outputs.get("legacy"),
      settings = test.settings.get("legacy");
    if (!action || !output || !settings) throw new Error("Missing legacy contribution");
    expect(reads).toEqual({ action: 3, output: 3, description: 3, settings: 0, menu: 1, add: 1 });
    expect(action.title).toBe("action/3");
    expect(output.title).toBe("output/3");
    expect(output.description).toBe("description/3");
    expect(settings.description).toBe("view-data/1");
    expect(settings.description).toBe("view-data/2");
    expect(receivers).toEqual([settings, settings]);
    test.environment.update({ locale: "en-US" });
    expect(action.title).toBe("action/3");
    expect(output.description).toBe("description/3");
    expect(test.states.get("legacy")?.children[0].menu?.[0].title).toBe("menu/1");
    expect(test.states.get("legacy")?.action?.title).toBe("add/1");
    expect(reads).toEqual({ action: 3, output: 3, description: 3, settings: 2, menu: 1, add: 1 });
  } finally {
    await test.host.dispose();
  }
});
