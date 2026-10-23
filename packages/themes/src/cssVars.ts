/**
 * 测试用的极简 CSS 变量解析：按选择器收集自定义属性声明，并在给定作用域链上解析 var()。
 * 只为宿主桥接的覆盖测试服务（jsdom 不解析 var() 链、对复合选择器与 @theme 支持不全），
 * 不是通用 CSS 解析器：不处理 @media / 嵌套 / !important，注释会先被剥离。
 */

export type CssVarBlocks = Map<string, Map<string, string>>;

/** 收集「选择器 → 自定义属性」，逗号分隔的选择器分别登记；同名声明后者覆盖前者 */
export function collectCssVars(css: string): CssVarBlocks {
  const blocks: CssVarBlocks = new Map();
  // 先剥注释，再剥 @import / @charset 这类以分号结尾的语句，免得被并进下一条规则的选择器
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@[\w-]+[^;{}]*;/g, "");
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of source.matchAll(rule)) {
    const selectors = match[1]
      .trim()
      .split(",")
      .map(selector => selector.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    const declaration = /(--[\w-]+)\s*:\s*([^;]+);?/g;
    for (const [, name, value] of match[2].matchAll(declaration)) {
      for (const selector of selectors) {
        const vars = blocks.get(selector) ?? new Map<string, string>();
        // 多行书写的取值（如 prettier 折行的多值阴影）规整为单行
        vars.set(name, value.trim().replace(/\s+/g, " "));
        blocks.set(selector, vars);
      }
    }
  }
  return blocks;
}

/** 依次叠加作用域（后者覆盖前者），返回解析 var() 后的读取函数；解析不到时返回空串 */
export function resolveCssVars(blocks: CssVarBlocks, scopes: string[]): (name: string) => string {
  const merged = new Map<string, string>();
  for (const scope of scopes)
    for (const [name, value] of blocks.get(scope) ?? []) merged.set(name, value);

  const resolve = (name: string, seen: Set<string>): string => {
    const raw = merged.get(name);
    if (raw === undefined || seen.has(name)) return "";
    const next = new Set(seen).add(name);
    let unresolved = false;
    const value = raw.replace(
      /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g,
      (_, ref: string, fallback?: string) => {
        const resolved = resolve(ref, next) || fallback?.trim() || "";
        if (!resolved) unresolved = true;
        return resolved;
      }
    );
    return unresolved ? "" : value;
  };
  return name => resolve(name, new Set());
}
