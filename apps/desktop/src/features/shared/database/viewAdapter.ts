import type { DatabaseView } from "@tau/database";

/** 只向通用视图协议投影界面需要的字段。 */
export function toDatabaseView(view: DatabaseView): DatabaseView {
  return { id: view.id, name: view.name, type: view.type, order: view.order, config: view.config };
}
