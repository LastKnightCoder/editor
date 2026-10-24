import { wordsCount } from "words-count";

/** 字段路径支持对象属性与数组项，例如 answers[].text。 */
export interface ContentMetricChildren {
  path: string;
  /** 仅在节点的该布尔字段为 true 时补充子树。 */
  when?: string;
  skip?: number;
  /** 排除标识与当前节点指定字段相同的项。 */
  exclude?: { field: string; equalsField: string };
  childrenPath?: string;
}

/** 扩展只声明内容字段；计数算法与普通 children 遍历由宿主统一执行。 */
export interface ContentMetricRule {
  type: string;
  textFields: readonly string[];
  additionalChildren?: readonly ContentMetricChildren[];
}

type NodeData = Record<string, unknown>;
const record = (value: unknown): value is NodeData =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const field = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[A-Za-z_$][\w$-]*$/.test(value) &&
  !["__proto__", "constructor", "prototype"].includes(value);
const validPath = (value: unknown): value is string =>
  typeof value === "string" && value.split(".").every(part => field(part.replace(/\[\]$/, "")));

/** 在进程边界重新校验，并复制为不可变快照；不携带插件可执行代码。 */
export function normalizeContentMetricRules(value: unknown): readonly ContentMetricRule[] {
  if (!Array.isArray(value)) throw new Error("字数统计规则必须是数组");
  const types = new Set<string>();
  return Object.freeze(
    value.map((rule: unknown) => {
      if (!record(rule) || typeof rule.type !== "string" || !rule.type || types.has(rule.type))
        throw new Error("字数统计节点类型无效或重复");
      types.add(rule.type);
      if (
        !Array.isArray(rule.textFields) ||
        !rule.textFields.every(validPath) ||
        new Set(rule.textFields).size !== rule.textFields.length
      )
        throw new Error("字数统计文本字段无效或重复");
      // children 的文本由统一遍历处理，不能再作为当前节点文本重复认领。
      if (rule.textFields.some(path => path.split(".")[0].replace(/\[\]$/, "") === "children"))
        throw new Error("字数统计不能重复声明 children");
      if (rule.additionalChildren !== undefined && !Array.isArray(rule.additionalChildren))
        throw new Error("字数统计补充子树无效");
      const additionalChildren = (rule.additionalChildren as unknown[] | undefined)?.map(source => {
        if (
          !record(source) ||
          !validPath(source.path) ||
          source.path.split(".")[0].replace(/\[\]$/, "") === "children" ||
          (source.when !== undefined && !field(source.when)) ||
          (source.skip !== undefined &&
            (!Number.isSafeInteger(source.skip) || Number(source.skip) < 0)) ||
          (source.childrenPath !== undefined && !validPath(source.childrenPath)) ||
          (source.exclude !== undefined &&
            (!record(source.exclude) ||
              !field(source.exclude.field) ||
              !field(source.exclude.equalsField)))
        )
          throw new Error("字数统计补充子树无效");
        return Object.freeze({
          path: source.path,
          ...(source.when === undefined ? {} : { when: source.when as string }),
          ...(source.skip === undefined ? {} : { skip: source.skip as number }),
          ...(source.childrenPath === undefined
            ? {}
            : { childrenPath: source.childrenPath as string }),
          ...(source.exclude === undefined
            ? {}
            : {
                exclude: Object.freeze({
                  field: (source.exclude as NonNullable<ContentMetricChildren["exclude"]>).field,
                  equalsField: (source.exclude as NonNullable<ContentMetricChildren["exclude"]>)
                    .equalsField,
                }),
              }),
        });
      });
      return Object.freeze({
        type: rule.type,
        textFields: Object.freeze([...rule.textFields]),
        ...(additionalChildren ? { additionalChildren: Object.freeze(additionalChildren) } : {}),
      });
    })
  );
}

function valuesAt(value: unknown, path: string): unknown[] {
  let values = [value];
  for (const part of path.split(".")) {
    const each = part.endsWith("[]");
    const key = each ? part.slice(0, -2) : part;
    values = values.flatMap(item => {
      const next = record(item) && Object.hasOwn(item, key) ? item[key] : undefined;
      return each ? (Array.isArray(next) ? next : []) : [next];
    });
  }
  return values;
}

export const countTextWords = (text: string): number => (text ? wordsCount(text) : 0);

export function createContentMetrics(initialRules: readonly ContentMetricRule[] = []) {
  let rules = normalizeContentMetricRules(initialRules);
  let byType = new Map(rules.map(rule => [rule.type, rule]));
  let revision = 0;
  const count = (content: readonly unknown[]): number => {
    let total = 0;
    const active = new Set<object>();
    const visit = (value: unknown) => {
      if (!record(value)) return;
      if (active.has(value)) throw new Error("字数统计发现循环子树");
      active.add(value);
      try {
        if (typeof value.text === "string" && !Array.isArray(value.children)) {
          total += countTextWords(value.text);
          return;
        }
        const rule = byType.get(String(value.type ?? ""));
        for (const path of rule?.textFields ?? [])
          for (const text of valuesAt(value, path))
            if (typeof text === "string") total += countTextWords(text);
        if (Array.isArray(value.children)) value.children.forEach(visit);
        for (const source of rule?.additionalChildren ?? []) {
          if (source.when && value[source.when] !== true) continue;
          const children = valuesAt(value, source.path).flatMap(item =>
            Array.isArray(item) ? item : [item]
          );
          for (const child of children.slice(source.skip ?? 0)) {
            if (
              source.exclude &&
              record(child) &&
              child[source.exclude.field] === value[source.exclude.equalsField]
            )
              continue;
            if (source.childrenPath)
              valuesAt(child, source.childrenPath)
                .flatMap(item => (Array.isArray(item) ? item : [item]))
                .forEach(visit);
            else visit(child);
          }
        }
      } finally {
        active.delete(value);
      }
    };
    content.forEach(visit);
    return total;
  };
  return {
    count,
    get revision() {
      return revision;
    },
    get rules() {
      return rules;
    },
    setRules(next: readonly ContentMetricRule[]) {
      const normalized = normalizeContentMetricRules(next);
      byType = new Map(normalized.map(rule => [rule.type, rule]));
      rules = normalized;
      revision++;
    },
  };
}

/** 自动清理只认空段落与空文本；图片、结构块和未知节点始终保留。 */
export function isContentEmpty(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  const active = new Set<object>();
  const empty = (node: unknown): boolean => {
    if (!record(node) || active.has(node)) return false;
    if (
      (node.type === undefined || node.type === "formatted") &&
      typeof node.text === "string" &&
      !Array.isArray(node.children)
    )
      return node.text.trim() === "";
    if (node.type !== "paragraph" || !Array.isArray(node.children)) return false;
    active.add(node);
    try {
      return node.children.every(empty);
    } finally {
      active.delete(node);
    }
  };
  return content.every(empty);
}
