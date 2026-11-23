import { Config } from "@remotion/cli/config";
import { hasSystemChrome, SYSTEM_CHROME, webpackOverride } from "./remotion.shared.ts";

if (hasSystemChrome) {
  Config.setBrowserExecutable(SYSTEM_CHROME);
  Config.setChromeMode("chrome-for-testing");
}

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.overrideWebpackConfig(webpackOverride);
