export * from "./types";
export { GithubPagesProvider } from "./github-pages";
export { S3HostingProvider } from "./s3-hosting";

import {
  IPublishProvider,
  IGithubPagesConfig,
  IS3HostingConfig,
} from "./types";
import { GithubPagesProvider } from "./github-pages";
import { S3HostingProvider } from "./s3-hosting";

export type PublishProviderType = "github" | "s3";

export interface IPublishProviderConfig {
  type: PublishProviderType;
  github?: IGithubPagesConfig;
  s3?: IS3HostingConfig;
}

/**
 * 创建发布提供者实例
 */
export function createPublishProvider(
  config: IPublishProviderConfig,
): IPublishProvider {
  switch (config.type) {
    case "github":
      if (!config.github) {
        throw new Error("GitHub Pages config is required");
      }
      return new GithubPagesProvider(config.github);

    case "s3":
      if (!config.s3) {
        throw new Error("S3 config is required");
      }
      return new S3HostingProvider(config.s3);

    default:
      throw new Error(`Unknown publish provider type: ${config.type}`);
  }
}

/**
 * 计算 basePath
 */
export function computeBasePath(
  type: PublishProviderType,
  config: IPublishProviderConfig,
): string {
  switch (type) {
    case "github":
      if (config.github?.repo) {
        return GithubPagesProvider.computeBasePath(config.github.repo);
      }
      return "/";

    case "s3":
      return config.s3?.pathPrefix || "/";

    default:
      return "/";
  }
}
