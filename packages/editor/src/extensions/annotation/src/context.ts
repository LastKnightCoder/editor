/** 注解所在段落的前后文，帮助确认点开的是哪一个 */
export function getAnnotationContext(before: string, after: string) {
  const head = before.replace(/\s+/g, " ").trimStart();
  const tail = after.replace(/\s+/g, " ").trimEnd();
  return {
    before: head.length > 28 ? `…${head.slice(-28)}` : head,
    after: tail.length > 16 ? `${tail.slice(0, 16)}…` : tail,
  };
}
