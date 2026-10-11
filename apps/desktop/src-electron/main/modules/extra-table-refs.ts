/**
 * 数据表回收的协作引用来源（D-136）：协作模块初始化时注册私有块引用计数读取器，
 * 数据库开库对账经此取数——database.ts 不直接 import 协作模块（后者已依赖前者，
 * 直接互引成环）。读取器未注册（协作模块未初始化）或调用抛错时，调用方须跳过
 * 本次表回收：不能确认协作引用就不删表。
 */

export type ExtraTableRefsProvider = (databaseName: string) => Map<number, number>;

let provider: ExtraTableRefsProvider | undefined;

export function setExtraTableRefsProvider(next: ExtraTableRefsProvider): void {
  provider = next;
}

export function getExtraTableRefsProvider(): ExtraTableRefsProvider | undefined {
  return provider;
}
