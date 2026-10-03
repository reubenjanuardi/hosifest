/** Tiny class-name joiner. No runtime dependency needed. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
