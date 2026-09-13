const ASAR_PATH_MARKS = ["/app.asar/", "\\app.asar\\"];
const ASAR_UNPACKED_PATH_MARKS = ["/app.asar.unpacked/", "\\app.asar.unpacked\\"];

/**
 * 把 app.asar 内的路径改写为 app.asar.unpacked 中的实体路径。
 *
 * Electron 只对 execFile/fork/dlopen 自动做这层重定向，spawn 不会，因此凡是
 * 交给 spawn 的可执行文件（解压用的 7za.exe、检索用的 rg.exe 等）都必须显式
 * 改写，否则打包后会稳定报 spawn ENOENT。
 */
export const toUnpackedAsarPath = (asarPath: string): string => {
  for (let i = 0; i < ASAR_PATH_MARKS.length; i++) {
    if (asarPath.includes(ASAR_PATH_MARKS[i])) {
      return asarPath.replace(ASAR_PATH_MARKS[i], ASAR_UNPACKED_PATH_MARKS[i]);
    }
  }
  return asarPath;
};
