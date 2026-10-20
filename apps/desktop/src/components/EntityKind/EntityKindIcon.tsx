import { useEntityKindMeta, type KindMeta } from ".";

interface EntityKindIconProps {
  entityRef: { kind: string; id: number };
  fallback: KindMeta;
  className?: string;
  size?: number | string;
  strokeWidth?: number | string;
}

/** 列表行内直接放置的类型图标 */
export function EntityKindIcon({ entityRef, fallback, ...props }: EntityKindIconProps) {
  const { icon: Icon } = useEntityKindMeta(entityRef, fallback);
  return <Icon {...props} />;
}

/** 列表行内直接放置的类型名 */
export function EntityKindLabel({
  entityRef,
  fallback,
}: {
  entityRef: { kind: string; id: number };
  fallback: KindMeta;
}) {
  return <>{useEntityKindMeta(entityRef, fallback).label}</>;
}
