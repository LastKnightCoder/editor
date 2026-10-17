/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 发布服务地址，默认 http://localhost:8787 */
  readonly VITE_API_BASE_URL?: string;
  /** "true" 时启用本地模拟适配器，仅 dev:web 可用 */
  readonly VITE_MOCK_API?: string;
}
