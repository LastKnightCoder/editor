/**
 * 示意画面登记：showcase/<域>/<name>.demo.tsx 即一块示意（默认导出组件），
 * 正文里用 `::demo{name="<name>"}` 引用。按需加载，不进文档首屏包。
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const modules = import.meta.glob<{ default: ComponentType }>("./**/*.demo.tsx");

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1, -".demo.tsx".length);

export const DEMO_NAMES: string[] = Object.keys(modules).map(nameOf);

const DEMOS = new Map<string, LazyExoticComponent<ComponentType>>(
  Object.entries(modules).map(([path, load]) => [nameOf(path), lazy(load)])
);

export const findDemo = (name: string) => DEMOS.get(name);
