import { assertPublishPath } from "@tau/plugins/template";

/** 只暂存本次发布拥有的路径，摘要资源即使被仓库 ignore 规则匹配也必须进入提交。 */
export async function stagePublication(
  git: { raw(args: string[]): PromiseLike<string> },
  uploads: string[],
  deletions: string[]
) {
  [...uploads, ...deletions].forEach(file => assertPublishPath(file));
  const owned = new Set([...uploads, ...deletions]);
  const staged = (await git.raw(["diff", "--cached", "--name-only", "-z"]))
    .split("\0")
    .filter(Boolean);
  if (staged.some(file => !owned.has(file)))
    throw new Error("发布缓存含其他暂存更改，请使用独立发布缓存目录");
  const tracked = new Set((await git.raw(["ls-files", "-z"])).split("\0").filter(Boolean));
  const paths = [...new Set([...uploads, ...deletions.filter(file => tracked.has(file))])];
  for (let index = 0; index < paths.length; index += 200)
    await git.raw([
      "--literal-pathspecs",
      "add",
      "--force",
      "--all",
      "--",
      ...paths.slice(index, index + 200),
    ]);
}

export function publicationGitError(error: unknown, secrets: string[] = []): Error {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) if (secret) message = message.replaceAll(secret, "[已隐藏]");
  message = message.replace(/https:\/\/[^/\s]+@/gi, "https://[已隐藏]@");
  return new Error(message);
}
