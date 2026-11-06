import { CommonTranslations } from './types';

type PathsToStringProps<T> = T extends string
  ? []
  : {
      [K in Extract<keyof T, string>]: [K, ...PathsToStringProps<T[K]>];
    }[Extract<keyof T, string>];

type PathsToString<T> = T extends (infer U)[]
  ? U extends string
    ? U extends ''
      ? never
      : U
    : never
  : never;

export type AllPaths<T> = PathsToString<PathsToStringProps<T>>;

type TranslationKeyObject<T> = {
  [K in keyof T]: T[K] extends object
    ? TranslationKeyObject<T[K]>
    : string;
};

type StringFunction = {
  (): string;
  [key: string]: unknown;
  toString(): string;
  valueOf(): string;
};

export function createTranslationKeys<T>(prefix: string = ''): TranslationKeyObject<T> {
  const buildPath = (currentPrefix: string, key: string): string => {
    return currentPrefix ? `${currentPrefix}.${key}` : key;
  };

  const createNestedKeys = (currentPrefix: string): StringFunction => {
    const pathFunction = function(): string {
      return currentPrefix;
    };

    pathFunction.toString = function(): string {
      return currentPrefix;
    };

    pathFunction.valueOf = function(): string {
      return currentPrefix;
    };

    return new Proxy(pathFunction, {
      get: (target: StringFunction, prop: string | symbol): unknown => {
        if (typeof prop !== 'string') return target;

        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return undefined;
        }

        if (prop in target) {
          return target[prop];
        }

        const newPath = buildPath(currentPrefix, prop);
        return createNestedKeys(newPath);
      },

      apply: (): string => {
        return currentPrefix;
      }
    }) as StringFunction;
  };

  return createNestedKeys(prefix) as unknown as TranslationKeyObject<T>;
}

export const COMMON = createTranslationKeys<CommonTranslations['common']>('common');
