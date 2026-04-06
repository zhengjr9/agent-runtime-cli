declare module 'bun:bundle' {
  export function feature(name: string): boolean
}

declare const Bun:
  | undefined
  | {
      hash(input: string): number | bigint
      listen<T>(options: T): unknown
    }
