import { describe, expect, it } from "vitest";
import {
  isAllowedWsOrigin,
  isServableStaticPath,
  resolveCorsOrigin,
  resolveDevServerOrigin,
} from "../server-access";

const EXTENSION = `chrome-extension://${"a".repeat(32)}`;
const DEV = "http://localhost:5173";

describe("resolveDevServerOrigin", () => {
  it("取开发服务器地址的 origin；打包版或非法地址为 null", () => {
    expect(resolveDevServerOrigin("http://localhost:5173/")).toBe(DEV);
    expect(resolveDevServerOrigin(undefined)).toBeNull();
    expect(resolveDevServerOrigin("not a url")).toBeNull();
  });
});

describe("isAllowedWsOrigin", () => {
  it("放行本机 node 客户端、打包渲染端", () => {
    expect(isAllowedWsOrigin(undefined, null)).toBe(true);
    expect(isAllowedWsOrigin("file://", null)).toBe(true);
  });

  it("浏览器扩展不能连通用路径（只能走 /browser 的配对握手）", () => {
    expect(isAllowedWsOrigin(EXTENSION, null)).toBe(false);
    expect(isAllowedWsOrigin(EXTENSION, DEV)).toBe(false);
  });

  it("开发期只放行 vite 渲染端自身", () => {
    expect(isAllowedWsOrigin(DEV, DEV)).toBe(true);
    expect(isAllowedWsOrigin(DEV, null)).toBe(false);
    expect(isAllowedWsOrigin("http://localhost:5174", DEV)).toBe(false);
  });

  it("拒绝网页、沙箱 iframe 与伪装的插件来源", () => {
    expect(isAllowedWsOrigin("https://evil.example", DEV)).toBe(false);
    expect(isAllowedWsOrigin("null", null)).toBe(false);
    expect(isAllowedWsOrigin("", null)).toBe(false);
    expect(isAllowedWsOrigin("chrome-extension://evil.example", null)).toBe(false);
    expect(isAllowedWsOrigin(`${EXTENSION}.evil.example`, null)).toBe(false);
  });
});

describe("resolveCorsOrigin", () => {
  it("只对开发期渲染端回显", () => {
    expect(resolveCorsOrigin(DEV, DEV)).toBe(DEV);
    expect(resolveCorsOrigin(EXTENSION, null)).toBeNull();
  });

  it("网页、file:// 与无 Origin 不发 CORS 头", () => {
    expect(resolveCorsOrigin("https://evil.example", DEV)).toBeNull();
    expect(resolveCorsOrigin("file://", null)).toBeNull();
    expect(resolveCorsOrigin("null", null)).toBeNull();
    expect(resolveCorsOrigin(undefined, null)).toBeNull();
  });
});

describe("isServableStaticPath", () => {
  it("放行子目录里的资源文件（含逐段编码的中文名）", () => {
    expect(isServableStaticPath("/resources/abc.png")).toBe(true);
    expect(isServableStaticPath("/remote-video-cache/x/y.mp4")).toBe(true);
    expect(isServableStaticPath(`/resources/${encodeURIComponent("图片 1.png")}`)).toBe(true);
    expect(isServableStaticPath("/resources/%2525E5%2525A4.png")).toBe(true);
  });

  it("拒绝根目录文件：设置、数据库、目录索引", () => {
    expect(isServableStaticPath("/setting.json")).toBe(false);
    expect(isServableStaticPath("/data.db")).toBe(false);
    expect(isServableStaticPath(`/${encodeURIComponent("工作.db")}`)).toBe(false);
    expect(isServableStaticPath("/")).toBe(false);
  });

  it("拒绝敏感目录与库/日志类文件", () => {
    expect(isServableStaticPath("/pi/auth.json")).toBe(false);
    expect(isServableStaticPath("/sessions/a/b.jsonl")).toBe(false);
    expect(isServableStaticPath("/collaboration/collaboration.db")).toBe(false);
    expect(isServableStaticPath("/index/data.index.db")).toBe(false);
    expect(isServableStaticPath("/resources/x.db-wal")).toBe(false);
    expect(isServableStaticPath("/resources/data.db.pre-x.bak")).toBe(false);
    expect(isServableStaticPath("/resources/.secret")).toBe(false);
  });

  it("拒绝绕过写法：大小写、穿越、编码斜杠、反斜杠、Windows 段尾点与数据流", () => {
    expect(isServableStaticPath("/PI/auth.json")).toBe(false);
    expect(isServableStaticPath("/Setting.JSON")).toBe(false);
    expect(isServableStaticPath("/resources/../setting.json")).toBe(false);
    expect(isServableStaticPath("/resources/%2e%2e/data.db")).toBe(false);
    expect(isServableStaticPath("/resources%2f..%2fsetting.json")).toBe(false);
    expect(isServableStaticPath("/resources%5c..%5cpi%5cauth.json")).toBe(false);
    expect(isServableStaticPath("/pi./auth.json")).toBe(false);
    expect(isServableStaticPath("/pi%20/auth.json")).toBe(false);
    expect(isServableStaticPath("/resources/data.db::$DATA")).toBe(false);
    expect(isServableStaticPath("/resources/a%00.png")).toBe(false);
    expect(isServableStaticPath("/resources/%E0%A4%A")).toBe(false);
  });
});
