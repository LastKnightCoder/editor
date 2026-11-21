const scopes = new Set<string>();

export function retainWhiteboardToolScope(scope: string) {
  scopes.add(scope);
  return () => {
    scopes.delete(scope);
  };
}

export function currentWhiteboardToolScope(): string | undefined {
  if (scopes.size === 1) return scopes.values().next().value;
}
