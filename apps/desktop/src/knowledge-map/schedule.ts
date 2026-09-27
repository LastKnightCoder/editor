/**
 * 离线地图的重算 / 落位时机阈值。纯计算，主进程与单测共用（不碰 electron 与库）。
 *
 * 都按规模取，不写死张数：压测（见 docs/link-graph/handoff.md §7.3）显示整体重算
 * 在 2 万张时是分钟级的，固定「新增 10 张就重算」在万级会一天触发好几次。
 */

/** 增量放置与编辑累计超过地图规模的这个比例，就在下次打开时整体重算 */
export const REBUILD_DRIFT_RATIO = 0.15;

/** 一次打开最少能同步落位这么多张新卡（小库） */
const SYNC_PLACE_MIN = 10;
/** 同步落位的上限也不超过地图规模的这个比例 */
const SYNC_PLACE_RATIO = 0.01;

/**
 * 一次打开图谱最多同步放置多少张新卡：小库至少 10 张，大库按比例放宽（2 万张时 200 张）。
 * 每张要跑一次 sqlite-vec 近邻查询（真实库约 80ms），在主进程里做太多会卡住窗口的 IPC；
 * 超过就改为后台整体重算。
 */
export function syncPlaceLimit(mapSize: number): number {
  return Math.max(SYNC_PLACE_MIN, Math.round(mapSize * SYNC_PLACE_RATIO));
}

/**
 * 卡片数不超过这个量时，首次构建就等着算完再返回（约 1 秒，避免「先链接图谱、再换成地图」闪一下）；
 * 超过就立刻回 building，渲染层先画链接图谱并轮询等结果。
 * 按压测的时间曲线取：2000 张约 8 秒已经等不起。
 */
export const WAIT_FIRST_BUILD_CARDS = 1200;
