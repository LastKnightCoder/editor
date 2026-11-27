/* eslint-disable react-refresh/only-export-components -- 此文件验证作者声明，不作为热更新组件入口。 */
import { usePluginEnvironment, type PluginContext, type PluginPageProps } from "@tau/plugins";
import {
  validatePortablePluginManifest,
  validatePortableDistributionManifest,
  type PortablePluginManifest,
} from "@tau/plugins/portable";

export function notificationContract(context: PluginContext, isOnSurface: () => boolean) {
  const options = {
    title: "任务完成",
    isOnSurface,
    actions: [{ label: "查看", reveal: true, onClick: () => Promise.resolve() }],
  } satisfies import("@tau/plugins").PluginNotificationOptions;
  const invalid: import("@tau/plugins").PluginNotificationOptions = {
    title: "任务完成",
    // @ts-expect-error 可见面判断必须同步完成。
    isOnSurface: async () => true,
  };
  void invalid;
  return context.notifications.send(options);
}

export function Page({ context }: PluginPageProps) {
  const environment = usePluginEnvironment();
  return (
    <div>
      {String(environment.input.coarsePointer)}
      {context.environment.platform}
    </div>
  );
}
export function check(context: PluginContext, manifest: PortablePluginManifest) {
  const page = context.pages.register({ id: "sample", title: "示例", component: Page });
  const entry = context.navigation.registerEntry({
    id: "sample",
    title: "示例",
    page,
    params: { n: 1 },
  });
  void entry.dispose();
  validatePortableDistributionManifest(manifest);
  const validated: PortablePluginManifest = validatePortablePluginManifest(manifest);
  void validated;
  // @ts-expect-error 作者不能改宿主环境。
  context.environment.platform = "ios";
}

export const metricRule: import("@tau/plugins").EditorMetricRule = {
  type: "example.source",
  textFields: ["source"],
};

export async function directoryContract(
  context: import("@tau/plugins").PluginContext,
  requestId: string
) {
  const list = await context.data.todoLists.create(
    { title: "评审准备", color: "blue" },
    { requestId }
  );
  const saved = await context.data.todoLists.update(
    list.id,
    { color: null },
    { expectedRevision: list.revision }
  );
  const calendar = await context.data.calendars.create(
    { title: "评审日历", visible: false },
    { requestId: `${requestId}:calendar` }
  );
  await context.data.calendars.update(
    calendar.id,
    { title: "新评审日历", color: "red" },
    { expectedRevision: calendar.revision }
  );
  // @ts-expect-error 不把任意外部颜色当作 Tau 色板。
  const invalid: import("@tau/plugins").PluginDirectoryColor = "#ff0000";
  return { saved, editable: saved.editable, invalid };
}

export function objectEventContract(context: import("@tau/plugins").PluginContext) {
  const handle = context.events.on(
    ["todo-list.created", "todo-list.updated", "todo-list.deleted"],
    event => {
      const id: string = event.id;
      void context.data.todoLists.get(id);
    }
  );
  // @ts-expect-error 对象级通知不保留旧集合事件。
  const retired: import("@tau/plugins").PluginEventType = "todos.changed";
  return { handle, retired };
}
