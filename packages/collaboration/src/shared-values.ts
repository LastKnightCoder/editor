import * as Y from "yjs";
import diff from "fast-diff";

// 与键序无关的深比较：Y 类型的 toJSON 键序与对象字面量不同，不能用 JSON.stringify 直接对比。
export function sharedValueEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const value = (input: unknown) => (input instanceof Y.AbstractType ? input.toJSON() : input);
  const left = value(a);
  const right = value(b);
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((entry, index) => sharedValueEquals(entry, right[index]))
    );
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every(
        key =>
          key in right &&
          sharedValueEquals(
            (left as Record<string, unknown>)[key],
            (right as Record<string, unknown>)[key]
          )
      )
    );
  }
  return false;
}

export function replaceText(text: Y.Text, value: string) {
  let offset = 0;
  for (const [operation, part] of diff(text.toString(), value)) {
    if (operation === -1) text.delete(offset, part.length);
    else if (operation === 1) {
      text.insert(offset, part);
      offset += part.length;
    } else offset += part.length;
  }
}

export function setSharedValue(map: Y.Map<unknown>, key: string, value: unknown): void {
  const previous = map.get(key);
  if (typeof value === "string") {
    const text = previous instanceof Y.Text ? previous : new Y.Text();
    if (text !== previous) map.set(key, text);
    replaceText(text, value);
  } else if (Array.isArray(value)) {
    const array = previous instanceof Y.Array ? previous : new Y.Array();
    if (array !== previous) map.set(key, array);
    const sharedLength = Math.min(array.length, value.length);
    for (let index = 0; index < sharedLength; index++) {
      const current = array.get(index);
      if (
        current instanceof Y.Map &&
        value[index] &&
        typeof value[index] === "object" &&
        !Array.isArray(value[index])
      ) {
        updateSharedObject(current, value[index] as Record<string, unknown>);
      } else if (!sharedValueEquals(current, value[index])) {
        array.delete(index, 1);
        array.insert(index, [toSharedValue(value[index])]);
      }
    }
    if (array.length > value.length) array.delete(value.length, array.length - value.length);
    if (value.length > sharedLength)
      array.insert(sharedLength, value.slice(sharedLength).map(toSharedValue));
  } else if (value && typeof value === "object") {
    const object = previous instanceof Y.Map ? previous : new Y.Map();
    if (object !== previous) map.set(key, object);
    updateSharedObject(object, value as Record<string, unknown>);
  } else if (previous !== value) map.set(key, value ?? null);
}

function toSharedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const array = new Y.Array();
    array.insert(0, value.map(toSharedValue));
    return array;
  }
  if (value && typeof value === "object") {
    const map = new Y.Map();
    for (const [key, entry] of Object.entries(value)) map.set(key, toSharedValue(entry));
    return map;
  }
  return value;
}

function updateSharedObject(map: Y.Map<unknown>, value: Record<string, unknown>) {
  for (const key of map.keys()) if (!(key in value)) map.delete(key);
  for (const [key, entry] of Object.entries(value)) setSharedValue(map, key, entry);
}
