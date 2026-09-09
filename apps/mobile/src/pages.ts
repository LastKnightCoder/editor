// 页面注册入口：Vite glob 收集所有页面定义文件（副作用注册进 router）。
// 新增页面 = 在 features/**/pages/ 下新建 *.page.tsx，无需改动本文件。

const pageModules = import.meta.glob("../features/**/pages/*.page.{ts,tsx}", { eager: true });

// 触发模块执行（definePage 注册）；未注册时给出显式告警
const registered = Object.keys(pageModules).length;
if (registered === 0) {
  console.warn("[pages] 未发现任何页面定义文件");
}

export {};
