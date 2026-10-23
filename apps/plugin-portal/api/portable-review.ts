import { readCenterReviewEvidence } from "@tau/plugins/center";
import type { PackageManifest, PlatformReviewEvidence } from "../contracts";
import { fail, type Env } from "./platform";

export function portablePlatformEnabled(env: Env, platform: string) {
  return (env.PORTABLE_PLATFORMS ?? "")
    .split(",")
    .map(value => value.trim())
    .includes(platform);
}
export function assertPortablePublication(env: Env, manifest: PackageManifest) {
  if (manifest.formatVersion === 3 && env.PORTABLE_PUBLISH_ENABLED !== "true")
    fail(409, "SUBMISSION_LOCKED", "跨端插件发布尚未开放");
}
export function readPlatformEvidence(
  manifest: PackageManifest,
  value: unknown,
  approval: boolean
): PlatformReviewEvidence | null {
  try {
    return readCenterReviewEvidence(manifest, value, approval);
  } catch (error) {
    return fail(400, "INVALID_INPUT", error instanceof Error ? error.message : "平台验收无效");
  }
}
