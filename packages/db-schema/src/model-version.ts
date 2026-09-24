export const DATA_MODEL_VERSION = 1;

export function assertCompatibleDataModel(info: { dataModelVersion?: unknown }) {
  const version = info.dataModelVersion === undefined ? 0 : info.dataModelVersion;
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 0 ||
    version > DATA_MODEL_VERSION
  ) {
    throw new Error("DB_MODEL_INCOMPATIBLE: 数据库模型版本不受支持，请升级全部客户端");
  }
}
