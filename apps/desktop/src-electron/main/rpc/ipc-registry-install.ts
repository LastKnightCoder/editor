import { installIpcRegistry } from "./ipc-registry";

// 必须作为主入口的第一个 import 执行：部分模块（如 ModuleInitManager）在
// import 期构造单例并注册 ipcMain handler，patch 需先于整个 import 图安装
installIpcRegistry();
