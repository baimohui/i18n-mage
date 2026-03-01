export type ApiCredentialsMap<TApi extends string> = Record<TApi, (string | undefined)[]>;

export function selectAvailableApiList<TApi extends string>(apiPriority: string[], apiMap: ApiCredentialsMap<TApi>): TApi[] {
  return apiPriority.filter((api): api is TApi => {
    if (!Object.prototype.hasOwnProperty.call(apiMap, api)) return false;
    const tokens = apiMap[api as TApi];
    return Array.isArray(tokens) && !tokens.some(token => typeof token !== "string" || token.trim() === "");
  });
}
