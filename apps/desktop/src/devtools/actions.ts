/**
 * 内置的开发快捷操作。新功能的操作可以写在这里，也可以在功能自己的模块里注册。
 */

import { getKnowledgeMap } from "@/commands/knowledge-map";
import { setKnowledgeMapCache } from "@/features/cards/queries";
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
}
