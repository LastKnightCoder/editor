const locks = new WeakMap<Document, { count: number; previous: string }>();

export function lockBodyScroll(owner: Document): () => void {
  const entry = locks.get(owner) ?? { count: 0, previous: owner.body.style.overflow };
  entry.count++;
  locks.set(owner, entry);
  owner.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--entry.count === 0) {
      owner.body.style.overflow = entry.previous;
      locks.delete(owner);
    }
  };
}
