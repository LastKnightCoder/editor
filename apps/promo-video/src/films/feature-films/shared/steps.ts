/**
 * 功能片里可以复用的步骤片段（装插件、打开「+」菜单选来源、粘链接解析视频）。纯 TS。
 */

/** 安装一个插件：点「安装」→ 确认框（可勾「以后不再提示」）→ 点「安装」→ 下载校验中 → 已安装。skipConfirm 为真时直接安装（上一次勾了不再提示） */
export const install = (id: string, opts: { skipConfirm?: boolean; tick?: boolean } = {}) =>
  opts.skipConfirm
    ? [{ click: `install:${id}`, as: `install:${id}` } as const, { mark: `confirm:${id}`, hold: 22 }, { mark: `installed:${id}`, hold: 14 }]
    : [
        { click: `install:${id}`, as: `install:${id}` } as const,
        { wait: 50 },
        ...(opts.tick ? [{ click: "confirm-check", as: "tick" } as const] : []),
        { click: "confirm", as: `confirm:${id}` } as const,
        { wait: 40 },
        { mark: `installed:${id}`, hold: 20 },
      ];

/** 解析一个视频：点输入框 → ⌘V 粘贴链接 → 点「解析视频」→ 解析中 → 出结果。每个弹窗的链接各记各的输入框、各记各的解析时刻 */
export const pasteAndResolve = (input: string, paste: string, parsed: string, wait: number) => [
  { click: "url", as: `focus:${input}` } as const,
  { keys: "⌘V", as: `pasted:${input}`, paste: { input, text: paste } },
  { wait: 20 },
  { click: "parse", as: `parse:${input}` },
  { wait },
  { mark: parsed },
  { wait: 20 },
];

/** 打开「+」菜单 → 鼠标停到「添加视频」上（二级菜单跟着出来）→ 子菜单里选一个来源 */
export const pickSource = (menu: string, source: string) => [
  { click: "add", as: `open:${menu}` } as const,
  { wait: 16 },
  { hover: "add:2", as: `hover:${menu}`, hold: 30 },
  { click: source, as: `pick:${menu}` },
  { wait: 36 },
];
