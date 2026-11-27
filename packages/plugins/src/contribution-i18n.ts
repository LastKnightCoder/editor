import { bindI18nFields, snapshotDisplayText, type DisplayText } from "@tau/i18n";

type ResolveText = (text: DisplayText) => string;

export function readContributionText(text: DisplayText, resolve: ResolveText): string;
export function readContributionText(
  text: DisplayText | undefined,
  resolve: ResolveText
): string | undefined;
export function readContributionText(
  text: DisplayText | undefined,
  resolve: ResolveText
): string | undefined {
  return text === undefined || typeof text === "string" ? text : resolve(snapshotDisplayText(text));
}

export function snapshotContributionText(text: DisplayText, trim = false): DisplayText {
  return typeof text === "string" ? (trim ? text.trim() : text) : snapshotDisplayText(text);
}

/** 设置说明原本是实时属性；字符串 getter 的求值时点与 receiver 保持原样。 */
export function bindLiveTextDescriptor(
  descriptor: PropertyDescriptor,
  resolve: ResolveText
): PropertyDescriptor {
  const get = descriptor.get;
  if (get)
    return {
      ...descriptor,
      get(this: unknown) {
        return readContributionText(Reflect.apply(get, this, []), resolve);
      },
    };
  const text: DisplayText | undefined = descriptor.value;
  if (text === undefined || typeof text === "string") return descriptor;
  const message = snapshotDisplayText(text);
  resolve(message);
  return {
    enumerable: descriptor.enumerable,
    configurable: descriptor.configurable,
    get: () => resolve(message),
  };
}

export function bindContributionText<T extends object, K extends keyof T>(
  input: T,
  keys: readonly K[],
  resolve: ResolveText
) {
  return bindI18nFields(
    input,
    keys.filter(key => Object.hasOwn(input, key)),
    text => readContributionText(text, resolve)
  );
}
