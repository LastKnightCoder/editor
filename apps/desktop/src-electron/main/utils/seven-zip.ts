import { createRequire } from "node:module";
import sevenZip from "7zip-min";
import { toUnpackedAsarPath } from "./asarPath";

// 7zip-min 自带的 asar 探测看的是 process.argv[1] 是否含 app.asar，安装版启动时
// 该条件恒不成立，它就会把 spawn 指向 asar 内的 7za.exe 而报 ENOENT，所以这里显式
// 指向 app.asar.unpacked 中的实体二进制（dev 下路径不含 app.asar，原样返回）。
// 二进制路径从 7zip-min 自身的依赖解析，避免为路径推导新增直接依赖。
const sevenZipRequire = createRequire(require.resolve("7zip-min"));
const { path7za } = sevenZipRequire("7zip-bin") as { path7za: string };

sevenZip.config({ binaryPath: toUnpackedAsarPath(path7za) });

export default sevenZip;
