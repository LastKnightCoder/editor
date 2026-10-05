/**
 * 知识地图数据：离线地图 + 节点展示信息，由主进程 knowledge-map:get 返回。
 */

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { getKnowledgeMap, type KnowledgeMapPayload } from "@/commands/knowledge-map";
import useGlobalStateStore from "@/stores/useGlobalStateStore";
import useSettingStore from "@/stores/useSettingStore";

export const knowledgeMapKey = (databaseName: string) => ["knowledge-map", databaseName] as const;

/**
 * 从外部写知识地图的缓存（开发悬浮球的「整体重算」）。一律经这里写，不要直接 setQueryData：
 * 缓存里存的是整个 payload（带 status，首次构建中时要轮询），曾经有人直接写进一份裸地图，
 * 图谱读 `.map` 读到 undefined，以为没有地图，退回了按链接跑力布局的链接图谱——
 * 分布与缩放全变了，重新进入页面才恢复。
 */
export function setKnowledgeMapCache(
  client: QueryClient,
  databaseName: string,
  payload: KnowledgeMapPayload
) {
  client.setQueryData<KnowledgeMapPayload | null>(knowledgeMapKey(databaseName), payload);
}

/**
 * 离线知识地图（主进程按「显式链接 + 语义近邻」算好的坐标与两层主题）。
 * 主进程在读取时顺带对账新增/删除的节点，过时则后台重算；这里每次打开地图页拉一次即可。
 * 取不到（无 Electron、索引库异常）时返回 null，图谱退回按链接实时计算。
 */
/** 首次构建中时的轮询间隔：万级库要几分钟，这点轮询的开销可以忽略 */
const KNOWLEDGE_MAP_POLL_MS = 3000;

export function useKnowledgeMap(enabled: boolean) {
  const databaseName = useSettingStore(state => state.setting.database.active);
  const ready = useGlobalStateStore(state => state.databaseStatus[databaseName] === "ready");
  return useQuery<KnowledgeMapPayload | null>({
    queryKey: knowledgeMapKey(databaseName),
    queryFn: async () => {
      if (typeof window === "undefined" || !window.electron) return null;
      try {
        return await getKnowledgeMap();
      } catch {
        return null;
      }
    },
    enabled: enabled && Boolean(databaseName) && ready,
    // 每次进入地图页重新对账（新写的内容落位），不做窗口聚焦刷新：地图变动不该在用户看着时跳
    staleTime: 0,
    refetchOnWindowFocus: false,
    // 大库首次构建是分钟级的：主进程立刻回 building，这里轮询等它算完
    //（期间渲染层显示链接图谱，用户能看能点）
    refetchInterval: query =>
      query.state.data?.status === "building" ? KNOWLEDGE_MAP_POLL_MS : false,
  });
}
