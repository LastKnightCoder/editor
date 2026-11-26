import { QUERY_SOURCES, isQuerySource } from "./catalog";
import { collectQueryData, executeQuery, parseQuery } from "./dsl";
import { validateQueryResult } from "./result";
import {
  QUERY_LIMITS,
  readQueryDefinition,
  querySerializedBytes,
  type QueryContext,
  type QueryDefinition,
  type QueryReadPage,
  type QueryReadRequest,
  type QueryResult,
  type QueryValue,
} from "./types";

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}
const scope = globalThis as typeof globalThis & WorkerScope;
let serial = 0;
let readRows = 0;
let readBytes = 0;
const pending = new Map<
  number,
  { resolve(page: QueryReadPage): void; reject(error: Error): void }
>();
const send = scope.postMessage.bind(scope);
function read(request: QueryReadRequest): Promise<QueryReadPage> {
  if (!isQuerySource(request.source)) return Promise.reject(new Error("未知的数据来源"));
  const id = ++serial;
  send({ type: "read", id, request });
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function run(definition: QueryDefinition, context: QueryContext): Promise<QueryResult> {
  let clockReported = false;
  context = new Proxy(context, {
    get(target, key, receiver) {
      if (!clockReported && (key === "now" || key === "today")) {
        clockReported = true;
        send({ type: "clock" });
      }
      return Reflect.get(target, key, receiver);
    },
  });
  if (definition.language === "dsl")
    return executeQuery(parseQuery(definition.code), read, context);
  const data = Object.freeze(
    Object.fromEntries(
      Object.keys(QUERY_SOURCES).map(name => {
        if (!isQuerySource(name)) throw new Error("数据来源无效");
        return [
          name,
          Object.freeze({
            collect: async (options: Record<string, QueryValue> = {}) =>
              (await collectQueryData(read, name, options)).items,
          }),
        ];
      })
    )
  );
  const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (
    ...args: string[]
  ) => (data: unknown, context: QueryContext) => Promise<unknown>;
  const result = await new AsyncFunction("data", "ctx", '"use strict";\n' + definition.code)(
    data,
    context
  );
  return validateQueryResult(result);
}
scope.onmessage = event => {
  const message = event.data;
  if (message?.type === "read-result") {
    const operation = pending.get(message.id);
    if (!operation) return;
    pending.delete(message.id);
    if (message.error) operation.reject(new Error(message.error));
    else {
      try {
        const page = message.page as QueryReadPage;
        if (!page || !Array.isArray(page.items)) throw new Error("数据源返回了无效分页");
        readRows += page.items.length;
        readBytes += querySerializedBytes(page);
        if (readRows > QUERY_LIMITS.readRows || readBytes > QUERY_LIMITS.bytes)
          throw new Error("读取的数据过多，请缩小查询范围");
        operation.resolve(page);
      } catch (error) {
        operation.reject(error instanceof Error ? error : new Error("数据源返回值无效"));
      }
    }
  } else if (message?.type === "run") {
    void Promise.resolve()
      .then(() => run(readQueryDefinition(message.definition), message.context))
      .then(
        result => send({ type: "result", result }),
        error =>
          send({ type: "error", error: error instanceof Error ? error.message : String(error) })
      );
  }
};
