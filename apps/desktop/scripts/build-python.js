#!/usr/bin/env node
/**
 * Python 模块构建脚本
 *
 * 功能:
 * 1. 检查 uv 是否安装
 * 2. 安装 Python 依赖
 * 3. 使用 PyInstaller 打包
 *
 * 用法:
 *   node build-python.js install    # 仅安装依赖
 *   node build-python.js build      # 仅打包
 *   node build-python.js            # 安装并打包
 *   node build-python.js check      # 检查环境
 */

const { execSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const SCRIPTS_DIR = path.join(__dirname, "..", "src-python");
const DIST_DIR = path.join(SCRIPTS_DIR, "dist");
const BUILD_DIR = path.join(SCRIPTS_DIR, "..", "build", "bin");

// 颜色输出
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(message) {
  log(`\n📦 ${message}`, "cyan");
}

function logSuccess(message) {
  log(`✅ ${message}`, "green");
}

function logWarning(message) {
  log(`⚠️  ${message}`, "yellow");
}

function logError(message) {
  log(`❌ ${message}`, "red");
}

/**
 * 检查命令是否存在
 */
function commandExists(cmd) {
  try {
    if (process.platform === "win32") {
      execSync(`where ${cmd}`, { stdio: "ignore" });
    } else {
      execSync(`which ${cmd}`, { stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
}

function getVenvExecutable(command) {
  if (process.platform === "win32") {
    return path.join(SCRIPTS_DIR, ".venv", "Scripts", `${command}.exe`);
  }

  return path.join(SCRIPTS_DIR, ".venv", "bin", command);
}

/**
 * 获取 Python 命令
 */
function getPythonCommand() {
  if (commandExists("python3")) return "python3";
  if (commandExists("python")) return "python";
  return null;
}

/**
 * 检查环境
 */
function checkEnvironment() {
  logStep("Checking environment...");

  const checks = [
    {
      name: "Python 3.10+",
      check: () => {
        const python = getPythonCommand();
        if (!python) return false;
        try {
          const version = execSync(`${python} --version`, {
            encoding: "utf-8",
          });
          const match = version.match(/Python (\d+)\.(\d+)/);
          if (match) {
            const major = parseInt(match[1]);
            const minor = parseInt(match[2]);
            return major >= 3 && minor >= 10;
          }
          return false;
        } catch {
          return false;
        }
      },
      hint: "Install Python 3.10+: https://python.org",
    },
    {
      name: "uv",
      check: () => commandExists("uv"),
      hint: "Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh",
    },
  ];

  let allPassed = true;

  for (const { name, check, hint } of checks) {
    if (check()) {
      logSuccess(`${name} is installed`);
    } else {
      logWarning(`${name} is not installed`);
      log(`   ${hint}`);
      allPassed = false;
    }
  }

  return allPassed;
}

/**
 * 安装 Python 依赖
 */
function installDependencies() {
  logStep("Installing Python dependencies with uv...");

  if (!commandExists("uv")) {
    logError("uv is not installed. Please install it first:");
    log("   curl -LsSf https://astral.sh/uv/install.sh | sh");
    log(
      '   Or on Windows: powershell -c "irm https://astral.sh/uv/install.ps1 | iex"',
    );
    return false;
  }

  try {
    // 创建虚拟环境
    log("Creating virtual environment...");
    execSync("uv venv", { cwd: SCRIPTS_DIR, stdio: "inherit" });

    // 安装依赖
    log("Installing dependencies from pyproject.toml...");
    execSync("uv pip install -e .", { cwd: SCRIPTS_DIR, stdio: "inherit" });

    // 安装 PyInstaller
    log("Installing PyInstaller...");
    execSync("uv pip install pyinstaller", {
      cwd: SCRIPTS_DIR,
      stdio: "inherit",
    });

    logSuccess("Python dependencies installed");
    return true;
  } catch (error) {
    logError(`Failed to install dependencies: ${error.message}`);
    return false;
  }
}

/**
 * 打包 Python 模块
 */
function buildExecutable() {
  logStep("Building Python executables with PyInstaller...");

  // 确保依赖已安装
  const venvPath = path.join(SCRIPTS_DIR, ".venv");
  const pyInstallerPath = getVenvExecutable("pyinstaller");
  if (!fs.existsSync(venvPath) || !fs.existsSync(pyInstallerPath)) {
    logWarning(
      "Virtual environment or PyInstaller not found, installing dependencies first...",
    );
    if (!installDependencies()) {
      return false;
    }
  }

  try {
    // 打包统一的 Python 服务器（包含转录和模型下载功能）
    log("Building python-server...");
    execSync(
      `"${getVenvExecutable("pyinstaller")}" --onefile --name python-server --collect-data faster_whisper --collect-data magika --collect-all FlagEmbedding --collect-all transformers --collect-all tokenizers --collect-all torch --collect-all mempalace --collect-submodules torch --collect-data torch --collect-binaries torch --distpath "${DIST_DIR}" main.py`,
      { cwd: SCRIPTS_DIR, stdio: "inherit" },
    );

    logSuccess("Python executable built");
    return true;
  } catch (error) {
    logError(`Failed to build executable: ${error.message}`);
    return false;
  }
}

/**
 * 复制到 extraResources 目录
 */
function copyToResources() {
  logStep("Copying executables to build/bin...");

  try {
    // 创建目标目录
    fs.mkdirSync(BUILD_DIR, { recursive: true });

    const ext = process.platform === "win32" ? ".exe" : "";
    const files = [{ src: `python-server${ext}`, dst: `python-server${ext}` }];

    for (const { src, dst } of files) {
      const srcPath = path.join(DIST_DIR, src);
      const dstPath = path.join(BUILD_DIR, dst);

      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, dstPath);
        log(`  Copied: ${dst}`);
      } else {
        logWarning(`  Not found: ${src}`);
      }
    }

    logSuccess("Executables copied to build/bin");
    return true;
  } catch (error) {
    logError(`Failed to copy executables: ${error.message}`);
    return false;
  }
}

/**
 * 清理构建产物
 */
function clean() {
  logStep("Cleaning build artifacts...");

  const dirsToClean = [
    path.join(SCRIPTS_DIR, "dist"),
    path.join(SCRIPTS_DIR, "build"),
    path.join(SCRIPTS_DIR, "__pycache__"),
    path.join(BUILD_DIR),
  ];

  const filesToClean = [
    path.join(SCRIPTS_DIR, "python-server.spec"),
    // Legacy spec files
    path.join(SCRIPTS_DIR, "transcriber.spec"),
    path.join(SCRIPTS_DIR, "model-downloader.spec"),
  ];

  for (const dir of dirsToClean) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true });
      log(`  Removed: ${dir}`);
    }
  }

  for (const file of filesToClean) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      log(`  Removed: ${file}`);
    }
  }

  logSuccess("Build artifacts cleaned");
}

/**
 * 主流程
 */
async function main() {
  const command = process.argv[2];

  log("\n🐍 Tau Transcriber - Python Build Script\n");

  switch (command) {
    case "check":
      const passed = checkEnvironment();
      process.exit(passed ? 0 : 1);
      break;

    case "install":
      if (!checkEnvironment()) {
        logWarning("\nSome dependencies are missing. Installation may fail.");
      }
      const installSuccess = installDependencies();
      process.exit(installSuccess ? 0 : 1);
      break;

    case "build":
      if (!buildExecutable()) {
        process.exit(1);
      }
      break;

    case "clean":
      clean();
      break;

    default:
      // 默认：检查环境、安装依赖、构建
      if (!checkEnvironment()) {
        logWarning("\nSome dependencies are missing. Continuing anyway...\n");
      }

      // 尝试安装依赖（如果虚拟环境不存在）
      const venvPath = path.join(SCRIPTS_DIR, ".venv");
      if (!fs.existsSync(venvPath)) {
        if (!installDependencies()) {
          logError("\nFailed to install dependencies. Exiting.");
          process.exit(1);
        }
      } else {
        log("Virtual environment exists, skipping dependency installation.");
      }

      // 构建
      if (!buildExecutable()) {
        process.exit(1);
      }

      log("\n🎉 Build completed successfully!\n");
      break;
  }
}

main().catch((error) => {
  logError(`Unexpected error: ${error.message}`);
  process.exit(1);
});
