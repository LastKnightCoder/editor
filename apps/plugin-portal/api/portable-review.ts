import type { PackageManifest } from "../contracts";
import { fail, type Env } from "./platform";

export function portablePlatformEnabled(env: Env, platform: string) {
  return (env.PORTABLE_PLATFORMS ?? "")
    .split(",")
    .map(value => value.trim())
    .includes(platform);
}
export function assertPortablePublication(env: Env, manifest: PackageManifest) {
  if (manifest.platform === "portable" && env.PORTABLE_PUBLISH_ENABLED !== "true")
    fail(409, "SUBMISSION_LOCKED", "跨端插件发布尚未开放");
}
