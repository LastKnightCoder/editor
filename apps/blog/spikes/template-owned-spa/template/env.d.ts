declare const __TEMPLATE_MODE__: "path" | "hash";
declare module "*.svg" {
  const url: string;
  export default url;
}

interface Window {
  __spike?: {
    mode: string;
    ready: boolean;
    activeKey?: string;
    pendingKey?: string;
    previewKey?: string;
    error?: string;
  };
}
