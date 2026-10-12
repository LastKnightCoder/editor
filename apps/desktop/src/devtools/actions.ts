/**
 * 内置的开发快捷操作。新功能的操作可以写在这里，也可以在功能自己的模块里注册。
 */

import { getKnowledgeMap } from "@/commands/knowledge-map";
import { setKnowledgeMapCache } from "@/features/knowledge-map/queries";
import {
  dismissAllNotifications,
  runProgressUpdateSequence,
  scheduleRealRouteTest,
  sendAvatarNotification,
  sendBurstNotifications,
  sendDangerNotification,
  sendOkNotification,
  sendPlainNotification,
} from "@/features/notifications/debug/systemNotificationMocks";
import { queryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";
import { registerDevAction } from "./registry";

export function registerBuiltinDevActions() {
  registerDevAction({
    id: "knowledge-map:rebuild",
    group: "知识地图",
    label: "整体重算知识地图",
    description: "忽略库里的地图，按当前卡片与向量重新划分主题与布局，写库后刷新图谱",
    run: async () => {
      const started = performance.now();
      const payload = await getKnowledgeMap({ rebuild: true });
      const map = payload.map;
      // 打开着的图谱直接换上新地图，不用切视图。写整个 payload，不是裸地图（见 setKnowledgeMapCache）
      const databaseName = useSettingStore.getState().setting.database.active;
      setKnowledgeMapCache(queryClient, databaseName, payload);
      if (!map) return "没有算出地图（库为空或索引未就绪）";
      const topics = map.topics.filter(t => t.parent === -1).length;
      const elapsed = Math.round(performance.now() - started);
      return `已重算：${map.nodes.length} 张卡、${topics} 个主题，用时 ${elapsed}ms`;
    },
  });

  // 系统通知窗口的样式 / 交互 mock：实现见 features/notifications/debug，这里只登记入口
  const systemNotificationActions: Array<{
    id: string;
    label: string;
    description: string;
    run: () => string;
  }> = [
    {
      id: "system-notification:plain",
      label: "纯告知",
      description: "长正文纯告知，测试系统窗口里的截断",
      run: sendPlainNotification,
    },
    {
      id: "system-notification:ok",
      label: "成功",
      description: "成功回执（tone ok）",
      run: sendOkNotification,
    },
    {
      id: "system-notification:danger",
      label: "失败",
      description: "失败通知，「重试」1.2 秒后成功并展示结果行",
      run: sendDangerNotification,
    },
    {
      id: "system-notification:avatar",
      label: "人物作答",
      description: "头像 + sticky，「拒绝」模拟网络异常报错，「同意」成功",
      run: sendAvatarNotification,
    },
    {
      id: "system-notification:burst",
      label: "连发 5 条",
      description: "间隔 150ms 连发，测试展开 3 张 + 叠层 + 还有 N 条",
      run: sendBurstNotifications,
    },
    {
      id: "system-notification:progress",
      label: "原位更新",
      description: "下载进度 30% → 80% → 完成带按钮，约 3 秒演完",
      run: runProgressUpdateSequence,
    },
    {
      id: "system-notification:real-route",
      label: "延迟 3 秒真实分流",
      description: "3 秒内切到其他应用，验证按真实焦点分流",
      run: scheduleRealRouteTest,
    },
    {
      id: "system-notification:dismiss-all",
      label: "全部清除",
      description: "关闭应用内与系统窗口两侧的全部通知",
      run: dismissAllNotifications,
    },
  ];
  for (const action of systemNotificationActions) {
    registerDevAction({ group: "系统通知窗口", compact: true, ...action });
  }
}
