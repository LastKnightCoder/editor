import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform === "darwin") {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const app = path.join(root, "build/bin/darwin/Tau Speech Helper.app");
  const executable = path.join(app, "Contents/MacOS/tau-speech");
  mkdirSync(path.dirname(executable), { recursive: true });
  const temporary = mkdtempSync(path.join(tmpdir(), "tau-speech-build-"));
  try {
    const arches = process.argv.includes("--universal")
      ? ["arm64", "x86_64"]
      : [process.arch === "arm64" ? "arm64" : "x86_64"];
    const binaries = arches.map(arch => {
      const output = path.join(temporary, arch);
      execFileSync(
        "xcrun",
        [
          "swiftc",
          "-parse-as-library",
          "-swift-version",
          "6",
          "-warnings-as-errors",
          "-O",
          "-target",
          `${arch}-apple-macos26.0`,
          path.join(root, "src-electron/native/speech/Main.swift"),
          "-o",
          output,
        ],
        { stdio: "inherit" }
      );
      return output;
    });
    execFileSync("lipo", ["-create", ...binaries, "-output", executable], { stdio: "inherit" });
    writeFileSync(
      path.join(app, "Contents/Info.plist"),
      `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.tau.speech-helper</string>
<key>CFBundleExecutable</key><string>tau-speech</string>
<key>CFBundleName</key><string>Tau Speech Helper</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSMinimumSystemVersion</key><string>26.0</string>
<key>LSUIElement</key><true/>
</dict></plist>`
    );
    execFileSync("codesign", ["--force", "--sign", "-", "--options", "runtime", app], {
      stdio: "inherit",
    });
    console.log("系统语音助手已构建");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
