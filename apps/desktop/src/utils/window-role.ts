/** 窗口角色只从 preload 读取，隔离的渲染上下文没有 Node process。 */
export const isMainWindow = () => window.electron?.windowRole === "main";
