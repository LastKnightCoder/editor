import type { Scalar, ValueType } from "./types";

/**
 * 表尾聚合算子定义（D-130）：内置 9 个与扩展贡献的算子走同一结构。
 * 只服务表尾汇总；公式（FooterSpec 的 expr 形态与公式列）仍只认内置 AggregateOp（D-121）。
 */
export interface DatabaseAggregateDefinition {
  /** 必须带命名空间（含 "."），不得与内置 9 个或其它扩展重名 */
  op: string;
  label: string;
  /** 适用的值类型；缺省表示所有类型（含未声明值类型的列） */
  valueTypes?: readonly ValueType[];
  /** 结果是计数（整数，不按列格式化）还是数值（按列 formatScalar 格式化） */
  resultKind: "count" | "numeric";
  compute(values: readonly Scalar[]): number | null;
}

/** 运行时聚合登记表：每个 Database 实例一份，内置与扩展算子走同一注册路径 */
export class AggregateRegistry {
  private definitions = new Map<string, DatabaseAggregateDefinition>();

  register(definition: DatabaseAggregateDefinition): void {
    if (this.definitions.has(definition.op)) {
      throw new Error(`聚合算子 "${definition.op}" 重复注册`);
    }
    this.definitions.set(definition.op, definition);
  }

  registerAll(definitions: readonly DatabaseAggregateDefinition[]): void {
    for (const definition of definitions) this.register(definition);
  }

  get(op: string): DatabaseAggregateDefinition | undefined {
    return this.definitions.get(op);
  }

  has(op: string): boolean {
    return this.definitions.has(op);
  }

  /** 该值类型可用的算子（注册顺序）；未声明值类型的列只能用不限类型的算子 */
  listFor(valueType: ValueType | null): DatabaseAggregateDefinition[] {
    return this.list().filter(
      definition => !definition.valueTypes || definition.valueTypes.includes(valueType as ValueType)
    );
  }

  /** 注册顺序即菜单展示顺序 */
  list(): DatabaseAggregateDefinition[] {
    return Array.from(this.definitions.values());
  }
}
