/** 服务标识符的类型只用于约束注册与获取，运行时以 id 匹配。 */
export interface ServiceIdentifier<T> {
  readonly id: string;
  readonly __serviceType: T;
}

export function createServiceId<T>(id: string): ServiceIdentifier<T> {
  return { id } as ServiceIdentifier<T>;
}
