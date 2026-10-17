/** 受限容器类别；元素以 joins 声明愿意进入的容器组。 */
export const CONTAINER_KINDS = ["layout"] as const;
export type ContainerKind = (typeof CONTAINER_KINDS)[number];
