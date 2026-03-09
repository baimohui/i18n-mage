import { CustomAiPlatform } from "@/types";

interface BatchConfig {
  maxLen: number;
  batchSize: number;
  interval: number;
}

interface RawCustomProviderConfig {
  id?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
  model?: unknown;
  enabled?: unknown;
  useProxy?: unknown;
  translateBatchConfig?: unknown;
  generateBatchConfig?: unknown;
}

export interface CustomProviderConfig {
  id: CustomAiPlatform;
  baseUrl: string;
  apiKey: string;
  model: string;
  useProxy: boolean;
  translateBatchConfig: BatchConfig;
  generateBatchConfig: BatchConfig;
}

const DEFAULT_TRANSLATE_BATCH_CONFIG: BatchConfig = { maxLen: 4000, batchSize: 20, interval: 800 };
const DEFAULT_GENERATE_BATCH_CONFIG: BatchConfig = { maxLen: 2000, batchSize: 10, interval: 1100 };

function toBatchConfig(rawValue: unknown, fallback: BatchConfig): BatchConfig {
  if (typeof rawValue !== "object" || rawValue === null) return fallback;
  const raw = rawValue as Partial<BatchConfig>;
  const maxLen = typeof raw.maxLen === "number" && raw.maxLen > 0 ? raw.maxLen : fallback.maxLen;
  const batchSize = typeof raw.batchSize === "number" && raw.batchSize > 0 ? raw.batchSize : fallback.batchSize;
  const interval = typeof raw.interval === "number" && raw.interval >= 0 ? raw.interval : fallback.interval;
  return { maxLen, batchSize, interval };
}

function toCustomAiId(rawId: string): CustomAiPlatform | null {
  const normalized = rawId.trim().replace(/^custom:/, "");
  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) return null;
  return `custom:${normalized}`;
}

export function parseCustomProviders(rawValue: unknown): CustomProviderConfig[] {
  if (!Array.isArray(rawValue)) return [];

  const result: CustomProviderConfig[] = [];
  const visited = new Set<string>();

  for (const item of rawValue) {
    const raw = item as RawCustomProviderConfig;
    if (typeof raw !== "object" || raw === null) continue;
    if (raw.enabled === false) continue;
    if (typeof raw.id !== "string" || typeof raw.baseUrl !== "string") continue;
    if (typeof raw.apiKey !== "string" || typeof raw.model !== "string") continue;

    const id = toCustomAiId(raw.id);
    const baseUrl = raw.baseUrl.trim();
    const apiKey = raw.apiKey.trim();
    const model = raw.model.trim();
    if (id === null || baseUrl === "" || apiKey === "" || model === "") continue;
    if (visited.has(id)) continue;

    visited.add(id);
    result.push({
      id,
      baseUrl,
      apiKey,
      model,
      useProxy: typeof raw.useProxy === "boolean" ? raw.useProxy : true,
      translateBatchConfig: toBatchConfig(raw.translateBatchConfig, DEFAULT_TRANSLATE_BATCH_CONFIG),
      generateBatchConfig: toBatchConfig(raw.generateBatchConfig, DEFAULT_GENERATE_BATCH_CONFIG)
    });
  }

  return result;
}
