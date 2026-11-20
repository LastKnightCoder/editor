export const macArmBuild =
  process.env.TAU_BUILD_MAC_ARM === "1"
    ? { arch: "arm64", outputDir: "release/local-mac-arm" }
    : null;

if (macArmBuild && (process.platform !== "darwin" || process.arch !== macArmBuild.arch)) {
  throw new Error("pnpm build:mac:arm 需要在 Apple 芯片 Mac 上使用原生 arm64 版 Node.js");
}
