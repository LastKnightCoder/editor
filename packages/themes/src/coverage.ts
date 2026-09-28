/**
 * 宿主桥接的覆盖检查：给定一个读取 CSS 变量计算值的函数，返回缺失或为空的 token 词。
 * 各宿主（自带主题体系、只桥接 --tau-* 的 app）在测试里对每套主题调用，保证全键齐全。
 */
import { ALL_TOKEN_WORDS, cssVarName, type TokenWord } from "./tokenContract.ts";

export function missingTokenWords(read: (cssVar: string) => string): TokenWord[] {
  return ALL_TOKEN_WORDS.filter(word => !read(cssVarName(word)).trim());
}
