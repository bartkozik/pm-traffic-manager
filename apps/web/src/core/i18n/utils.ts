import { CommonTranslations } from './types';

// Type for creating path strings with dot notation
type PathsToStringProps<T> = T extends string
  ? []
  : {
      [K in Extract<keyof T, string>]: [K, ...PathsToStringProps<T[K]>];
    }[Extract<keyof T, string>];

// Convert path array to dot notation string
type PathsToString<T> = T extends (infer U)[]
  ? U extends string
    ? U extends ''
      ? never
      : U
    : never
  : never;

// Get all possible paths in dot notation
export type AllPaths<T> = PathsToString<PathsToStringProps<T>>;

// Type for translation key objects
type TranslationKeyObject<T> = {
  [K in keyof T]: T[K] extends object 
    ? TranslationKeyObject<T[K]> 
    : string;
};

// Type for our custom function that can be used as a string
type StringFunction = {
  (): string;
  [key: string]: unknown;
  toString(): string;
  valueOf(): string;
};

/**
 * Creates a type-safe translation key object for a specific namespace
 * 
 * @param prefix The namespace prefix for the translation keys
 * @returns A nested object with translation keys that can be used with i18next
 */
export function createTranslationKeys<T>(prefix: string = ''): TranslationKeyObject<T> {
  // Create a function to build nested paths
  const buildPath = (currentPrefix: string, key: string): string => {
    return currentPrefix ? `${currentPrefix}.${key}` : key;
  };
  
  // Create a recursive function to build the translation key object
  const createNestedKeys = (currentPrefix: string): StringFunction => {
    // Create a function that returns the current path
    const pathFunction = function(): string {
      return currentPrefix;
    };
    
    // Add toString and valueOf methods
    pathFunction.toString = function(): string {
      return currentPrefix;
    };
    
    pathFunction.valueOf = function(): string {
      return currentPrefix;
    };
    
    // Create the proxy
    return new Proxy(pathFunction, {
      // Handle property access (e.g., AUTH.login.title)
      get: (target: StringFunction, prop: string | symbol): unknown => {
        if (typeof prop !== 'string') return target;
        
        // Skip special properties
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return undefined;
        }
        
        // Pass through existing properties like toString and valueOf
        if (prop in target) {
          return target[prop];
        }
        
        // For normal properties, create a new nested proxy
        const newPath = buildPath(currentPrefix, prop);
        return createNestedKeys(newPath);
      },
      
      // Handle function calls (AUTH.login.title())
      apply: (): string => {
        return currentPrefix;
      }
    }) as StringFunction;
  };
  
  return createNestedKeys(prefix) as unknown as TranslationKeyObject<T>;
}

// Create common translation keys
export const COMMON = createTranslationKeys<CommonTranslations['common']>('common');
