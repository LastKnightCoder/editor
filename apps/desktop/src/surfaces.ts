/**
 * 页面注册入口：Vite glob 收集所有 surface 定义文件（副作用注册进 router）。
 * 新增页面 = 在 features/<域>/surfaces/ 下新建 *.surface.tsx，无需改动本文件。
 */
const modules = import.meta.glob("/src/features/**/surfaces/*.surface.tsx", { eager: true });

if (import.meta.env.DEV && Object.keys(modules).length === 0) {
  console.warn("[surfaces] 未发现任何页面定义文件");
}
export {};
