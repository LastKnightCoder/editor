import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { assertPublishPath } from "@tau/plugins/template";

/** 导出与 Git 工作目录中的既有链接不能把文件操作导向目录外。 */
export function publicationDestination(root: string, relative: string): string {
  assertPublishPath(relative);
  let target = realpathSync(root);
  for (const segment of relative.split("/")) {
    target = path.join(target, segment);
    try {
      if (lstatSync(target).isSymbolicLink())
        throw new Error("发布目标包含符号链接，请使用普通输出目录");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return target;
}
