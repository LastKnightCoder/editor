import { deviceReplacementState, deviceStore, deviceSyncDatabase } from "./device-sync/native";

export type ContentWriteContext = Readonly<{
  database: string;
  generation: string;
  version: number;
}>;

export function assertContentWriteContext(context: ContentWriteContext) {
  const current = deviceReplacementState(context.database);
  if (
    context.database !== deviceSyncDatabase() ||
    current.active ||
    current.version !== context.version
  )
    throw new Error("DEVICE_SYNC_REPLACED: 正文写入上下文已失效");
}

export async function captureContentWriteContext(
  database = deviceSyncDatabase()
): Promise<ContentWriteContext> {
  const version = deviceReplacementState(database).version;
  const generation = database ? await deviceStore<string>("generation", {}, database) : "";
  const context = Object.freeze({ database, generation, version });
  assertContentWriteContext(context);
  return context;
}
