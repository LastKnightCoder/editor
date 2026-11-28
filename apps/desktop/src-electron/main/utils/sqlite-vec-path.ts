import { existsSync } from "node:fs";
import * as sqliteVec from "sqlite-vec";
import { toUnpackedAsarPath } from "./asarPath";

export const sqliteVecExtensionPath = (): string => {
  const defaultLoadablePath = sqliteVec.getLoadablePath();
  const unpackedLoadablePath = toUnpackedAsarPath(defaultLoadablePath);
  const targetLoadablePath =
    unpackedLoadablePath !== defaultLoadablePath && existsSync(unpackedLoadablePath)
      ? unpackedLoadablePath
      : defaultLoadablePath;

  return targetLoadablePath;
};
