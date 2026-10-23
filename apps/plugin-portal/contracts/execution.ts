import { requiresSystemReview as requiresExecutionReview } from "@tau/plugins/template";
import type { PackageManifest } from "./index";

/** 本机后台与带脚本的 Skill 会在用户本机执行代码，版本必须经人工系统审核。 */
export const requiresSystemReview = (manifest: PackageManifest): boolean =>
  manifest.formatVersion !== 3 && requiresExecutionReview(manifest);
