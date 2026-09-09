import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

// Native session tokens live only in Keychain/Keystore. Browser previews use volatile memory.
const memory = new Map<string, string>();
const queues = new Map<string, Promise<unknown>>();
const safe = (key: string) => key.replace(/[^a-zA-Z0-9._-]/g, "_");
function utf8Chunks(value: string): string[] {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let chunk = "",
    bytes = 0;
  // Count encoded bytes, not UTF-16 code units. Never split an emoji pair.
  for (const character of value) {
    const size = encoder.encode(character).byteLength;
    if (bytes + size > 1800) {
      chunks.push(chunk);
      chunk = "";
      bytes = 0;
    }
    chunk += character;
    bytes += size;
  }
  chunks.push(chunk);
  return chunks;
}
async function manifest(
  key: string,
): Promise<{ prefix: string; count: number } | null> {
  const value = await SecureStore.getItemAsync(key);
  if (!value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("prefix" in parsed) ||
    !("count" in parsed) ||
    typeof parsed.prefix !== "string" ||
    !parsed.prefix.startsWith(`${key}.`) ||
    !/^[a-zA-Z0-9._-]+$/.test(parsed.prefix) ||
    typeof parsed.count !== "number" ||
    !Number.isInteger(parsed.count) ||
    parsed.count < 1 ||
    parsed.count > 100
  )
    return null;
  return { prefix: parsed.prefix, count: parsed.count };
}
async function clear(parts: { prefix: string; count: number } | null) {
  if (parts)
    await Promise.all(
      Array.from({ length: parts.count }, (_, index) =>
        SecureStore.deleteItemAsync(`${parts.prefix}.${index}`),
      ),
    );
}
function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(work);
  queues.set(key, next);
  void next
    .finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    })
    .catch(() => undefined);
  return next;
}
export const secureStorage = {
  getItem: (key: string): Promise<string | null> =>
    serial(safe(key), async () => {
      if (Platform.OS === "web") return memory.get(key) ?? null;
      const parts = await manifest(safe(key));
      if (!parts) return null;
      const values = await Promise.all(
        Array.from({ length: parts.count }, (_, index) =>
          SecureStore.getItemAsync(`${parts.prefix}.${index}`),
        ),
      );
      return values.some((value) => value === null) ? null : values.join("");
    }),
  setItem: (key: string, value: string) =>
    serial(safe(key), async () => {
      if (Platform.OS === "web") {
        memory.set(key, value);
        return;
      }
      const previous = await manifest(safe(key));
      const chunks = utf8Chunks(value);
      if (chunks.length > 100)
        throw new Error("Session storage limit exceeded.");
      const parts = {
        prefix: `${safe(key)}.${Crypto.randomUUID()}`,
        count: chunks.length,
      };
      try {
        for (const [index, chunk] of chunks.entries())
          await SecureStore.setItemAsync(`${parts.prefix}.${index}`, chunk, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          });
        await SecureStore.setItemAsync(safe(key), JSON.stringify(parts), {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      } catch (error) {
        await clear(parts).catch(() => undefined);
        throw error;
      }
      // The new manifest is committed; stale-chunk cleanup is best effort.
      await clear(previous).catch(() => undefined);
    }),
  removeItem: (key: string) =>
    serial(safe(key), async () => {
      if (Platform.OS === "web") {
        memory.delete(key);
        return;
      }
      const previous = await manifest(safe(key));
      await SecureStore.deleteItemAsync(safe(key));
      await clear(previous);
    }),
};
