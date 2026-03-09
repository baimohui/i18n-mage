export type ApiCredentialsMap<TApi extends string = string> = Record<string, (string | undefined)[]> &
  Partial<Record<TApi, (string | undefined)[]>>;

export function normalizeApiPriority<TApi extends string>(apiPriority: string[] = [], apiMap: ApiCredentialsMap<TApi>): TApi[] {
  const normalized: TApi[] = [];
  const visited = new Set<TApi>();

  for (const api of apiPriority) {
    if (!Object.prototype.hasOwnProperty.call(apiMap, api)) continue;
    const apiId = api as TApi;
    if (visited.has(apiId)) continue;
    visited.add(apiId);
    normalized.push(apiId);
  }

  for (const api of Object.keys(apiMap) as TApi[]) {
    if (visited.has(api)) continue;
    visited.add(api);
    normalized.push(api);
  }

  return normalized;
}

export function selectAvailableApiList<TApi extends string>(apiPriority: string[] = [], apiMap: ApiCredentialsMap<TApi>): TApi[] {
  return normalizeApiPriority(apiPriority, apiMap).filter(api => {
    if (!Object.prototype.hasOwnProperty.call(apiMap, api)) return false;
    const tokens = apiMap[api];
    return Array.isArray(tokens) && !tokens.some(token => typeof token !== "string" || token.trim() === "");
  });
}
