import { customAlphabet } from 'nanoid';

const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 16);

export type IdPrefix = 't' | 's' | 'l' | 'f' | 'h';

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${nano()}`;
}

export function newEpoch(): string {
  return nano();
}
