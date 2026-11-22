/**
 * 辅助栏视图登记入口：收集 features/<域>/assist/*.assist.tsx（副作用登记进 app/assistViews）。
 */
const modules = import.meta.glob("/src/features/**/assist/*.assist.tsx", {
  eager: true,
});

if (import.meta.env.DEV && Object.keys(modules).length === 0) {
  console.warn("[assist] 未发现任何辅助栏视图");
}
export {};
