import { ipcMain } from "electron";
import { setCommandBridge } from "@tau/rpc";
import { installIpcRegistry } from "./ipc-registry";

// 必须作为主入口的第一个 import 执行：部分模块（如 ModuleInitManager）在
// import 期构造单例并注册 ipcMain handler，patch 需先于整个 import 图安装
installIpcRegistry();

// 主进程侧契约桥：register 经（已被 patch 的）ipcMain 走原有管道，
// registry 照常收录，HTTP RPC 分发无需感知契约层的存在
setCommandBridge({
  register: (channel, handler) => {
    ipcMain.handle(channel, handler as never);
  },
});
