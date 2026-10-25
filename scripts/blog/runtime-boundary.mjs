const contentProtocols = new Set([
  "packages/db-schema/content-resources.ts",
  "packages/db-schema/content-metrics.ts",
]);

export function assertBlogRuntimeInputs(inputs) {
  for (const input of inputs) {
    // 资源与字数统计属于跨端正文协议；其余库表与宿主实现仍禁止打包。
    if (contentProtocols.has(input)) continue;
    if (/^(?:apps\/|packages\/db-schema\/)/.test(input))
      throw new Error(`Editor 不得包含应用或数据库实现：${input}`);
    if (
      /tests\/fixtures\/plugins|src\/extensions\/(?:html|custom-block)\/|node_modules\/(?:abcjs|@babel\/standalone)\//.test(
        input
      )
    )
      throw new Error(`Editor 包包含已迁出实现：${input}`);
  }
}
