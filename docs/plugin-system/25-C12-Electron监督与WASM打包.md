# C12-B Electron 进程监督、WASM 打包与生命周期

**历史实验，已暂停。** 按用户最新要求，当前代码树已撤下 QuickJS 运行时及依赖，回到 TS 主干的可信流程，见 [26](26-C12-TS主干与可信流程闭环.md)。以下源码路径与命令仅对应历史提交 `361be27e7`，不作为当前入口或选型结论。

日期：2026-10-15。基线 `7185a04ad`。本单元承接 [24](24-C12最小权限执行边界.md)，验证真实 Electron 的 utilityProcess 和独立安装包；不扩展作者 API，不接生产插件管理、不恢复发布平台。

## 实现与复用

- `supervisor.mjs`（历史源码） 继续负责授权、身份绑定、预算、请求验证与撤销；只增加内部进程启动适配点，不复制权限判断。
- `worker-core.mjs`（历史源码） 收口 C12-A 客体解释器和有界字符串桥；Node 与 Electron 入口共用。`probe.read` 仍只读取夹具，未导出 SDK。
- `electron-supervisor.mjs`（历史源码） 适配 utilityProcess 的 postMessage、spawn、exit 和 kill；在宿主销毁时收回活动实例，在独立测试应用退出时等待回收。
- `electron-worker.mjs`（历史源码） 经 process.parentPort 收发固定协议；消息取 event.data，不把事件对象或端口交给客体。
- `electron-main.mjs`（历史源码） 是独立真实 Electron 测试主入口；没有测试桩替代 utilityProcess，也不启动完整业务 App。
- `verify-restricted-electron.mjs`（历史源码） 构建、打包、启动四个独立应用进程并生成报告。没有新增依赖，使用仓库现有 esbuild、electron-builder 和 Electron。

## 进程与生命周期

只有 app.ready 后能启动。授权失败不创建进程；PID 等 spawn 后记录，退出后仍保留诊断 PID。撤销先关闭权限通道，再请求 utilityProcess.kill；250 ms 后仍属于同一活动 UtilityProcess 的 PID 才升级为 SIGKILL，禁止对退出后可能复用的 PID 发终止信号。

启动期间撤销记录关闭意图，spawn 后立即终止；不能因为当时没有 PID 就放过后来的进程。异常退出归为 PROCESS_FAILED，后续实例可独立启动；客体执行/全生命周期预算沿用 C12-A。返回结果等待退出回收，重复撤销和 dispose 幂等。

实测发现 Electron 的 exit 可先于操作系统完成 PID 回收，因此最多等待 2 秒确认进程不存在；不确认时返回 PROCESS_FAILED，不伪报清理成功。此确认只检查存活，不对旧 PID 追加 kill。

测试宿主 dispose 撤销所有在途读取、取消 signal、等待进程退出并移除退出监听；关闭后的宿主拒绝再次启动，新工作区使用新宿主/身份。app.quit 在独立应用中等待活动子进程回收后继续退出。

这不是完整业务应用的切库或未保存守卫接线。生产整合时必须在现有退出/切库仲裁中安排时序，不能把这个测试宿主的 before-quit 处理直接放到用户尚可取消的退出流程中；强制撤权与普通用户取消另行处理。宿主被操作系统强杀、进程硬 RSS 配额与签名分发也不在本次完成范围。

## WASM 与独立打包

构建输出为 ESM 主入口、单文件 worker 与固定 quickjs.wasm，保留依赖许可证。worker 的 QuickJS JS 实现全部打入产物；WASM 从 worker 同目录读取并显式传给解释器，不使用远端 URL，也不回退 node_modules。

验证程序在仓库外含中文与空格的临时目录生成最小项目，通过 electron-builder 26.8.1 构建真实 macOS `.app`：主入口和 package.json 位于 app.asar；worker/WASM 通过 extraResources 放在 Resources/restricted。断言 app.asar 只有这两个文件，构建与打包后的代码/WASM 摘要一致；运行前删除构建源目录。bundle 外部引用仅允许 electron 与 node: 内置模块。

开发运行检查 app.isPackaged=false；安装包运行检查 app.isPackaged=true。打包使用本机 Electron 43.1.1，不下载另一个版本；不签名、不公证、不发布。此最小应用证明资源布局可行，不等于 Tau 完整安装包已接入该运行器。

缺失或损坏 WASM 时，子进程启动失败，宿主返回 PROCESS_FAILED，测试服务调用次数为零。临时应用和 userData 在验证后清理；保留的 JSON 报告包含平台、真实版本、每阶段结果、PID、资源体积和摘要。

## 验证

```sh
node scripts/plugins/verify-restricted-electron.mjs
node --test --test-timeout=20000 scripts/plugins/restricted/boundary.test.mjs
node node_modules/eslint/bin/eslint.js scripts/plugins/restricted/*.mjs scripts/plugins/verify-restricted-electron.mjs
```

报告输出到 `output/plugin-restricted-electron/report.json`。当前支持并实测 macOS arm64，Electron 43.1.1（内嵌 Node 24.18.0）；Node 回归使用本机 Node 24.21.0。其他平台明确未验收。

| 阶段            | 场景                                                                                                                                            | 结果      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 开发启动        | 授权拒绝/合法读取、环境旁路、双工作区隔离、启动时撤销、宿主销毁/迟到读取、死循环/悬挂、异常退出恢复、内存/消息限额、重复运行清理、app.quit 回收 | 10 项通过 |
| 独立安装包      | 同一组场景，真实 app.isPackaged=true                                                                                                            | 10 项通过 |
| 安装包缺失 WASM | 失败关闭，无夹具服务调用                                                                                                                        | 1 项通过  |
| 安装包损坏 WASM | 失败关闭，无夹具服务调用                                                                                                                        | 1 项通过  |
| Node 边界回归   | 原 C12-A 全部攻击性场景                                                                                                                         | 15 项通过 |

没有视觉走查；没有运行完整桌面业务构建、生产数据库或真实用户数据服务。源码和构建产物都不新增公共 API。

## 发现与后续

首次直接复制 Electron.app 得到 app.isPackaged=false，不能当作安装包验收；已改成 electron-builder 真实打包。首次缺失 WASM 场景也暴露 exit/PID 回收时序差异，已补有界确认。失败报告现在保留子进程阶段诊断，验证入口显式返回失败退出码，不让打包库的退出处理覆盖结果。

下一单元 C12-C 以既有 create/activate/deactivate、命令和私有存储适配受限执行生命周期，继续不增加领域 API；需覆盖授权撤销、私有存储的提交时机和实际切库身份。C13 仍负责本地生产安装、授权界面、兼容与升级恢复；C14 完成干净作者本地闭环，发布平台继续暂停。

依据：[Electron 43.1.1 utilityProcess](https://github.com/electron/electron/blob/v43.1.1/docs/api/utility-process.md)、[parentPort](https://github.com/electron/electron/blob/v43.1.1/docs/api/parent-port.md)。进程隔离用于终止和故障隔离，权限边界仍依赖解释器与宿主桥；不宣称 utilityProcess 本身是 OS 权限沙箱。
