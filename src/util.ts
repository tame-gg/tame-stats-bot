export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index] as T, index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export function formatNumber(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "N/A";
  if (digits === 0) return Math.round(value).toLocaleString("en-US");
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function compactSession(session: { online: boolean; gameType?: string; mode?: string; map?: string } | null): string {
  if (!session?.online) return "Offline";
  return [session.gameType, session.mode, session.map].filter(Boolean).join(" \u00b7 ") || "Online";
}
