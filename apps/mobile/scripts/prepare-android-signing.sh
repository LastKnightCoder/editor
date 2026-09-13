#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ANDROID_APP_DIR="${MOBILE_DIR}/src-tauri/gen/android/app"
ANDROID_APP_GRADLE="${ANDROID_APP_DIR}/build.gradle.kts"

if [[ ! -d "${ANDROID_APP_DIR}" ]]; then
  # Android 工程尚未生成（未跑过 tauri android init/build），安静跳过；
  # dev:android / build:android:* 已串联本脚本，生成后会自动补上
  echo "Android 工程不存在，跳过签名准备（首次运行 tauri android dev/build 时自动执行）。"
  exit 0
fi

if [[ ! -f "${ANDROID_APP_GRADLE}" ]]; then
  echo "缺少 Android Gradle 文件: ${ANDROID_APP_GRADLE}"
  exit 1
fi

ensure_gradle_signing_hook() {
  if grep -q "codex-auto-signing-start" "${ANDROID_APP_GRADLE}"; then
    TMP_FILE="$(mktemp)"
    awk '
      /codex-auto-signing-start/ { skipping=1; next }
      /codex-auto-signing-end/ { skipping=0; next }
      !skipping { print }
    ' "${ANDROID_APP_GRADLE}" > "${TMP_FILE}"
    mv "${TMP_FILE}" "${ANDROID_APP_GRADLE}"
  fi

  cat >> "${ANDROID_APP_GRADLE}" <<'EOF'

// codex-auto-signing-start
val codexKeystoreProperties = Properties().apply {
    val propFile = file("keystore.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}
val codexStoreFilePath = System.getenv("TAURI_ANDROID_KEYSTORE_PATH")
    ?: codexKeystoreProperties.getProperty("storeFile")
val codexStorePassword = System.getenv("TAURI_ANDROID_KEYSTORE_PASSWORD")
    ?: codexKeystoreProperties.getProperty("storePassword")
val codexKeyAlias = System.getenv("TAURI_ANDROID_KEY_ALIAS")
    ?: codexKeystoreProperties.getProperty("keyAlias")
val codexKeyPassword = System.getenv("TAURI_ANDROID_KEY_PASSWORD")
    ?: codexKeystoreProperties.getProperty("keyPassword")
val codexStoreFile = if (!codexStoreFilePath.isNullOrBlank()) file(codexStoreFilePath) else null
val codexHasSigning = codexStoreFile?.exists() == true
    && !codexStorePassword.isNullOrBlank()
    && !codexKeyAlias.isNullOrBlank()
    && !codexKeyPassword.isNullOrBlank()

android {
    signingConfigs {
        if (codexHasSigning) {
            val releaseConfig = findByName("release") ?: create("release")
            releaseConfig.storeFile = codexStoreFile
            releaseConfig.storePassword = codexStorePassword
            releaseConfig.keyAlias = codexKeyAlias
            releaseConfig.keyPassword = codexKeyPassword
        }
    }
    buildTypes {
        getByName("debug") {
            // debug 包也用 release 证书签名：与正式安装包签名一致，
            // dev 构建可直接覆盖安装已装的正式包（避免 INSTALL_FAILED_UPDATE_INCOMPATIBLE）
            if (codexHasSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        getByName("release") {
            if (codexHasSigning) {
                signingConfig = signingConfigs.getByName("release")
            } else {
                project.logger.lifecycle(
                    "Release signing is not configured. Build output may be unsigned."
                )
            }
        }
    }
}
// codex-auto-signing-end
EOF
  echo "已更新 Android release 自动签名配置: ${ANDROID_APP_GRADLE}"
}

ensure_gradle_signing_hook

pick_working_keytool() {
  local candidate=""
  for candidate in \
    "$(command -v keytool 2>/dev/null || true)" \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool"; do
    if [[ -n "${candidate}" ]] && [[ -x "${candidate}" ]]; then
      if "${candidate}" -help >/dev/null 2>&1; then
        echo "${candidate}"
        return 0
      fi
    fi
  done
  return 1
}

KEYTOOL_BIN="$(pick_working_keytool || true)"
if [[ -z "${KEYTOOL_BIN}" ]]; then
  if [[ -f "${ANDROID_APP_DIR}/keystore.properties" ]]; then
    # 无 keytool（如未装 JDK 的环境）：保留现有签名配置，仅注入 gradle hook
    echo "未找到 keytool，保留现有 keystore 配置并仅注入签名 hook。"
  else
    echo "未找到 keytool 且无现有签名配置，跳过签名准备。请安装 JDK 或 Android Studio。"
    exit 0
  fi
fi

generate_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -d '\n' | tr '/+' 'AB' | cut -c1-32
  else
    date +%s | shasum -a 256 | cut -c1-32
  fi
}

SIGNING_DIR="${TAURI_ANDROID_SIGNING_DIR:-${HOME}/.editor-mobile-signing}"
CREDENTIALS_FILE="${SIGNING_DIR}/credentials.env"
KEYSTORE_PATH_DEFAULT="${SIGNING_DIR}/editor-mobile-release.jks"
KEY_ALIAS_DEFAULT="${TAURI_ANDROID_KEY_ALIAS:-editor_upload}"
KEY_DNAME_DEFAULT="${TAURI_ANDROID_KEY_DNAME:-CN=Editor Mobile,O=Editor,C=US}"

mkdir -p "${SIGNING_DIR}"
chmod 700 "${SIGNING_DIR}" || true

if [[ -f "${CREDENTIALS_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${CREDENTIALS_FILE}"
fi

if [[ -f "${ANDROID_APP_DIR}/keystore.properties" ]]; then
  EXISTING_STORE_PASSWORD="$(sed -n 's/^storePassword=//p' "${ANDROID_APP_DIR}/keystore.properties" | head -n1)"
  EXISTING_KEY_PASSWORD="$(sed -n 's/^keyPassword=//p' "${ANDROID_APP_DIR}/keystore.properties" | head -n1)"
  EXISTING_KEY_ALIAS="$(sed -n 's/^keyAlias=//p' "${ANDROID_APP_DIR}/keystore.properties" | head -n1)"
else
  EXISTING_STORE_PASSWORD=""
  EXISTING_KEY_PASSWORD=""
  EXISTING_KEY_ALIAS=""
fi

KEYSTORE_PATH="${TAURI_ANDROID_KEYSTORE_PATH:-${KEYSTORE_PATH:-${KEYSTORE_PATH_DEFAULT}}}"
KEY_ALIAS="${TAURI_ANDROID_KEY_ALIAS:-${KEY_ALIAS:-${EXISTING_KEY_ALIAS:-${KEY_ALIAS_DEFAULT}}}}"
STORE_PASSWORD="${TAURI_ANDROID_KEYSTORE_PASSWORD:-${STORE_PASSWORD:-${EXISTING_STORE_PASSWORD:-}}}"
KEY_PASSWORD="${TAURI_ANDROID_KEY_PASSWORD:-${KEY_PASSWORD:-${EXISTING_KEY_PASSWORD:-}}}"

if [[ "${STORE_PASSWORD}" == "your_store_password" || -z "${STORE_PASSWORD}" ]]; then
  STORE_PASSWORD="$(generate_password)"
fi
if [[ "${KEY_PASSWORD}" == "your_key_password" || -z "${KEY_PASSWORD}" ]]; then
  KEY_PASSWORD="${STORE_PASSWORD}"
fi

# PKCS12 默认要求 keyPassword 与 storePassword 一致，这里统一处理避免签名失败。
KEY_PASSWORD="${STORE_PASSWORD}"

keystore_password_ok() {
  if [[ ! -f "${KEYSTORE_PATH}" ]]; then
    return 1
  fi
  if [[ -z "${KEYTOOL_BIN:-}" ]]; then
    # 无 keytool 无法验证：信任现有配置，避免误判密码不符后重建证书造成签名分叉
    return 0
  fi
  "${KEYTOOL_BIN}" -list -keystore "${KEYSTORE_PATH}" -storepass "${STORE_PASSWORD}" >/dev/null 2>&1
}

NEED_CREATE_KEYSTORE=0
if [[ ! -f "${KEYSTORE_PATH}" ]]; then
  NEED_CREATE_KEYSTORE=1
elif ! keystore_password_ok; then
  BACKUP_PATH="${KEYSTORE_PATH}.bak.$(date +%Y%m%d%H%M%S)"
  mv "${KEYSTORE_PATH}" "${BACKUP_PATH}"
  echo "检测到 keystore 密码与配置不一致，已备份旧文件到: ${BACKUP_PATH}"
  NEED_CREATE_KEYSTORE=1
fi

if [[ "${NEED_CREATE_KEYSTORE}" == "1" ]]; then
  if [[ -n "${TAURI_ANDROID_KEYSTORE_B64:-}" ]]; then
    mkdir -p "$(dirname "${KEYSTORE_PATH}")"
    if ! echo "${TAURI_ANDROID_KEYSTORE_B64}" | base64 --decode > "${KEYSTORE_PATH}" 2>/dev/null; then
      echo "${TAURI_ANDROID_KEYSTORE_B64}" | base64 -D > "${KEYSTORE_PATH}"
    fi
    echo "已从 TAURI_ANDROID_KEYSTORE_B64 导入 keystore: ${KEYSTORE_PATH}"
  else
    mkdir -p "$(dirname "${KEYSTORE_PATH}")"
    "${KEYTOOL_BIN}" -genkeypair -v \
      -keystore "${KEYSTORE_PATH}" \
      -storepass "${STORE_PASSWORD}" \
      -alias "${KEY_ALIAS}" \
      -keypass "${KEY_PASSWORD}" \
      -keyalg RSA \
      -keysize 4096 \
      -validity 36500 \
      -dname "${KEY_DNAME_DEFAULT}" >/dev/null
    echo "已自动生成 release keystore: ${KEYSTORE_PATH}"
  fi
fi

if [[ -f "${KEYSTORE_PATH}" ]] && [[ -z "${STORE_PASSWORD}" || -z "${KEY_PASSWORD}" ]]; then
  echo "检测到已有 keystore 但缺少密码，无法自动继续。"
  echo "请设置 TAURI_ANDROID_KEYSTORE_PASSWORD / TAURI_ANDROID_KEY_PASSWORD，或删除旧 keystore 让脚本重建。"
  exit 1
fi

cat > "${CREDENTIALS_FILE}" <<EOF
KEYSTORE_PATH=${KEYSTORE_PATH}
KEY_ALIAS=${KEY_ALIAS}
STORE_PASSWORD=${STORE_PASSWORD}
KEY_PASSWORD=${KEY_PASSWORD}
EOF
chmod 600 "${CREDENTIALS_FILE}" || true

cat > "${ANDROID_APP_DIR}/keystore.properties" <<EOF
storeFile=${KEYSTORE_PATH}
storePassword=${STORE_PASSWORD}
keyAlias=${KEY_ALIAS}
keyPassword=${KEY_PASSWORD}
EOF
chmod 600 "${ANDROID_APP_DIR}/keystore.properties" || true

echo "Android release 签名准备完成。"
echo "keystore.properties: ${ANDROID_APP_DIR}/keystore.properties"
echo "keystore: ${KEYSTORE_PATH}"
