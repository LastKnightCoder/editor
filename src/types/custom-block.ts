// 自定义组件 manifest.json 结构
export interface ICustomBlockManifest {
  name: string; // 组件名称
  author: string; // 作者
  description: string; // 功能描述
}

// 完整的自定义组件信息
export interface ICustomBlock {
  id: string; // 组件 ID（文件夹名称）
  manifest: ICustomBlockManifest; // manifest 信息
  source: string; // Component.tsx 源码
  readme: string; // README.md 内容
  path: string; // 组件文件夹的绝对路径
  enabled: boolean; // 是否启用
  isLocal: boolean; // 是否为本地创建的组件
  createTime?: number; // 创建时间
  updateTime?: number; // 更新时间
}

// 本地配置（存储启用/禁用状态和本地创建标记）
export interface ICustomBlockConfig {
  blocks: {
    [blockId: string]: {
      enabled: boolean; // 是否启用
      isLocal: boolean; // 是否为本地创建
      createTime?: number; // 创建时间
      updateTime?: number; // 更新时间
    };
  };
}

// 创建组件的参数
export interface ICreateCustomBlockParams {
  id: string; // 组件 ID
  name: string; // 组件名称
  author: string; // 作者
  description: string; // 描述
}
