export interface RuntimeServiceToken<TValue> {
  readonly description: string;
  readonly key: symbol;
  readonly valueType?: TValue;
}

export interface RuntimeServiceBinding {
  readonly token: RuntimeServiceToken<unknown>;
  readonly value: unknown;
}

export interface RuntimeServiceRegistry {
  get<TValue>(token: RuntimeServiceToken<TValue>): TValue | undefined;
  require<TValue>(token: RuntimeServiceToken<TValue>): TValue;
}

export function defineRuntimeServiceToken<TValue>(
  description: string,
): RuntimeServiceToken<TValue> {
  return Object.freeze({ description, key: Symbol(description) });
}

export function bindRuntimeService<TValue>(
  token: RuntimeServiceToken<TValue>,
  value: TValue,
): RuntimeServiceBinding {
  return { token, value };
}

export function createRuntimeServiceRegistry(
  bindings: readonly RuntimeServiceBinding[],
): RuntimeServiceRegistry {
  const values = new Map<symbol, unknown>();
  for (const binding of bindings) {
    if (values.has(binding.token.key)) {
      throw new Error(
        `Runtime service "${binding.token.description}" has multiple providers.`,
      );
    }
    values.set(binding.token.key, binding.value);
  }

  const get = <TValue>(token: RuntimeServiceToken<TValue>) =>
    values.get(token.key) as TValue | undefined;
  return Object.freeze({
    get,
    require<TValue>(token: RuntimeServiceToken<TValue>): TValue {
      const value = get(token);
      if (value === undefined) {
        throw new Error(
          `Required runtime service "${token.description}" is unavailable.`,
        );
      }
      return value;
    },
  });
}
