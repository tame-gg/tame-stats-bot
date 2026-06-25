import { log } from "../log.ts";

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Fetch a PNG (or other image) from a URL and return the raw bytes. Used to
 * pull tame.gg OG cards server-side so Discord receives them as file
 * attachments instead of hotlinked embed images.
 */
export async function fetchImageBuffer(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<Buffer | null> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const res = await fetch(url, {
      headers: { Accept: "image/png,image/*" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      log.warn({ url, status: res.status }, "og image fetch failed");
      return null;
    }
    const bytes = await res.arrayBuffer();
    return Buffer.from(bytes);
  } catch (err) {
    log.warn(
      { url, err: err instanceof Error ? err.message : String(err) },
      "og image fetch error",
    );
    return null;
  }
}
