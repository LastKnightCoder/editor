import { PluginConflictError } from "@tau/plugins";

type Writer = { flush(): Promise<boolean>; clean(): boolean };
const writers = new Map<string, Set<Writer>>();
const keyOf = (library: string, document: string) => JSON.stringify([library, document]);

/** 活动编辑视图保留草稿的所有权；外部修改必须先冲洗，且不能越过新输入。 */
export function registerContentWriter(library: string, document: string, writer: Writer) {
  const key = keyOf(library, document);
  const entries = writers.get(key) ?? new Set<Writer>();
  entries.add(writer);
  writers.set(key, entries);
  return () => {
    entries.delete(writer);
    if (!entries.size) writers.delete(key);
  };
}
export async function prepareContentWrite(library: string, document: string) {
  const entries = [...(writers.get(keyOf(library, document)) ?? [])];
  for (const writer of entries)
    if (!(await writer.flush())) throw new PluginConflictError("编辑器有尚未保存的输入");
  return () => {
    for (const writer of writers.get(keyOf(library, document)) ?? [])
      if (!writer.clean()) throw new PluginConflictError("准备修改期间用户继续输入，请重新读取");
  };
}
