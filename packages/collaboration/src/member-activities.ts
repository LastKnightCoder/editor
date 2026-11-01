import type { Member } from "./protocol";

/** 同一设备多个视图按编辑、查看、后台的优先级汇总。 */
export function memberActivities(
  deviceIds: Iterable<string>,
  states: Iterable<{ user?: { id?: unknown }; activity?: unknown }>
): Map<string, Member["activity"]> {
  const online = new Map<string, Member["activity"]>();
  for (const id of deviceIds) online.set(id, "background");
  for (const state of states) {
    const id = state.user?.id;
    if (typeof id !== "string" || !online.has(id)) continue;
    if (
      state.activity === "editing" ||
      (state.activity === "viewing" && online.get(id) !== "editing")
    )
      online.set(id, state.activity);
  }
  return online;
}
