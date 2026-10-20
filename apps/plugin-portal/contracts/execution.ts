import type { PackageManifest } from "./index";

export const requiresSystemReview = (manifest: PackageManifest): boolean =>
  "backend" in manifest && Boolean(manifest.backend);
