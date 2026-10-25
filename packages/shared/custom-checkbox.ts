// 根级转发（同 media-types 等惯例）：主进程可达代码经此窄入口取组件，
// 不触达 src/index.ts 根桶（含 MediaPlayer 等渲染组件，会拖入动画库）
export { default as CustomCheckbox } from "./src/components/CustomCheckbox";
export { default } from "./src/components/CustomCheckbox";
