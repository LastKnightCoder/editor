import { snapshotDisplayText, type DisplayText } from "@tau/i18n";
import {
  assertProviderForm,
  type ProviderChoiceOption,
  type ProviderField,
  type ProviderFieldGroup,
  type ProviderForm,
  type ProviderFormDeclaration,
} from "./provider-form.ts";

type ResolveText = (text: DisplayText) => string;
type Callable = (...args: never[]) => unknown;

function propertyOf(source: object, key: PropertyKey): PropertyDescriptor | undefined {
  for (let owner: object | null = source; owner; owner = Object.getPrototypeOf(owner)) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor) return descriptor;
  }
}

function descriptorsOf(source: object): PropertyDescriptorMap {
  const descriptors: PropertyDescriptorMap = Object.create(null);
  for (
    let owner: object | null = source;
    owner && owner !== Object.prototype;
    owner = Object.getPrototypeOf(owner)
  ) {
    for (const key of Reflect.ownKeys(owner)) {
      if (key === "constructor" || Object.hasOwn(descriptors, key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      if (!descriptor) continue;
      descriptors[key] = descriptor.get
        ? { ...descriptor, get: () => Reflect.get(source, key, source), set: undefined }
        : { ...descriptor };
    }
  }
  return descriptors;
}

function bindText(
  source: object,
  descriptors: PropertyDescriptorMap,
  key: string,
  resolve: ResolveText
) {
  const descriptor = propertyOf(source, key);
  if (!descriptor) return;
  if (descriptor.get) {
    descriptors[key] = {
      enumerable: descriptor.enumerable,
      get: () => {
        const value: DisplayText | undefined = Reflect.get(source, key, source);
        return value === undefined || typeof value === "string"
          ? value
          : resolve(snapshotDisplayText(value));
      },
    };
    return;
  }
  if (descriptor.value === undefined || typeof descriptor.value === "string") return;
  const message = snapshotDisplayText(descriptor.value);
  resolve(message);
  descriptors[key] = { enumerable: descriptor.enumerable, get: () => resolve(message) };
}

function bindMethod(
  source: object,
  descriptors: PropertyDescriptorMap,
  key: string,
  wrap: (method: Callable) => Callable
) {
  const descriptor = propertyOf(source, key);
  if (!descriptor) return;
  const cache = new WeakMap<Callable, Callable>();
  const bound = (method: Callable): Callable => {
    let value = cache.get(method);
    if (!value) {
      value = wrap(method);
      cache.set(method, value);
    }
    return value;
  };
  if (descriptor.get) {
    descriptors[key] = {
      enumerable: descriptor.enumerable,
      get: () => {
        const method: unknown = Reflect.get(source, key, source);
        return typeof method === "function" ? bound(method as Callable) : method;
      },
    };
  } else if (typeof descriptor.value === "function") {
    descriptors[key] = { enumerable: descriptor.enumerable, value: bound(descriptor.value) };
  }
}

function resolveOption(
  source: ProviderChoiceOption<DisplayText>,
  resolve: ResolveText
): ProviderChoiceOption {
  const descriptors = descriptorsOf(source);
  for (const key of ["label", "description"]) bindText(source, descriptors, key, resolve);
  return Object.freeze(Object.defineProperties({}, descriptors)) as ProviderChoiceOption;
}

function resolveField(source: ProviderField<DisplayText>, resolve: ResolveText): ProviderField {
  const descriptors = descriptorsOf(source);
  for (const key of ["label", "description", "placeholder"])
    bindText(source, descriptors, key, resolve);
  if (source.type === "choice") {
    descriptors.options = {
      enumerable: true,
      value: Object.freeze(source.options.map(option => resolveOption(option, resolve))),
    };
  } else if (source.type === "remote-choice") {
    bindMethod(
      source,
      descriptors,
      "load",
      method =>
        ((...args: Parameters<typeof source.load>) => {
          const pending: ReturnType<typeof source.load> = Reflect.apply(method, source, args);
          return pending.then(options =>
            Object.freeze(options.map(option => resolveOption(option, resolve)))
          );
        }) as Callable
    );
  }
  return Object.freeze(Object.defineProperties({}, descriptors)) as ProviderField;
}

function resolveGroup(
  source: ProviderFieldGroup<DisplayText>,
  resolve: ResolveText
): ProviderFieldGroup {
  const descriptors = descriptorsOf(source);
  for (const key of ["title", "description"]) bindText(source, descriptors, key, resolve);
  const sourceLink = source.link;
  if (sourceLink) {
    const link = descriptorsOf(sourceLink);
    bindText(sourceLink, link, "label", resolve);
    descriptors.link = {
      enumerable: true,
      value: Object.freeze(Object.defineProperties({}, link)),
    };
  }
  descriptors.fields = {
    enumerable: true,
    value: Object.freeze(source.fields.map(field => resolveField(field, resolve))),
  };
  return Object.freeze(Object.defineProperties({}, descriptors)) as ProviderFieldGroup;
}

/** 每次登记独占一份视图；文案 getter 读取所属插件，回调与业务字段不随语言重建。 */
export function resolveProviderForm(
  input: ProviderFormDeclaration,
  resolve: ResolveText
): ProviderForm {
  assertProviderForm(input, resolve);
  const descriptors = descriptorsOf(input);
  descriptors.groups = {
    enumerable: true,
    value: Object.freeze(input.groups.map(group => resolveGroup(group, resolve))),
  };
  bindMethod(input, descriptors, "beforeSave", method => method.bind(input));
  return Object.freeze(Object.defineProperties({}, descriptors)) as ProviderForm;
}
