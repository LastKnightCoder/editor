const path = require("node:path");
const { Arch } = require("electron-builder");

module.exports = async event => {
  const version = event.packager.appInfo.version;
  if (!event.file || !path.basename(event.file).includes(`-v${version}-`)) return;
  const buildId = process.env.TAU_DESKTOP_BUILD_ID;
  if (!buildId || process.env.TAU_DESKTOP_BUILD_VERSION !== version)
    throw new Error("缺少已校验的 buildId，请通过桌面 build 脚本打包");
  const { recordArtifactBuild } = await import("../../../scripts/desktop-artifact-build.mjs");
  await recordArtifactBuild({
    file: event.file,
    buildId,
    version,
    platform: event.packager.platform.nodeName,
    arch: event.arch == null ? undefined : Arch[event.arch],
  });
};
