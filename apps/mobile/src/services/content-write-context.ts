import { databaseReplacementState, databaseGeneration, activeDatabase } from "./database-runtime";

export type ContentWriteContext = Readonly<{
  database: string;
  generation: string;
  version: number;
}>;

export function assertContentWriteContext(context: ContentWriteContext) {
  const current = databaseReplacementState(context.database);
  if (
    context.database !== activeDatabase() ||
    current.active ||
    current.version !== context.version
  )
    throw new Error("DATABASE_REPLACED: 正文写入上下文已失效");
}

export async function captureContentWriteContext(
  database = activeDatabase()
): Promise<ContentWriteContext> {
  const version = databaseReplacementState(database).version;
  const generation = database ? await databaseGeneration(database) : "";
  const context = Object.freeze({ database, generation, version });
  assertContentWriteContext(context);
  return context;
}
