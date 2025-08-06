import tunnel from "tunnel";
import { Agent as HttpAgent } from "http";
import { NotificationManager } from "./notification";
import { t } from "./i18n";
import { getConfig } from "./config";

type Tunnel = {
  httpsOverHttp: (options: { proxy: { host: string; port: number; headers: { "User-Agent": string } } }) => HttpAgent;
  httpsOverHttps: (options: { proxy: { host: string; port: number; headers: { "User-Agent": string } } }) => HttpAgent;
};

export function getProxyAgent(): HttpAgent | undefined {
  const enableProxy = getConfig<boolean>("translationServices.proxy.enable", false);

  if (!enableProxy) return undefined;

  const host = getConfig<string>("translationServices.proxy.host", "127.0.0.1");
  const port = getConfig<number>("translationServices.proxy.port", 7890);
  const protocol = getConfig<string>("translationServices.proxy.protocol", "http");

  try {
    const agentFactory = (tunnel as Tunnel)[`httpsOver${protocol === "https" ? "Https" : "Http"}`];
    return agentFactory({
      proxy: {
        host,
        port,
        headers: {
          "User-Agent": "Node"
        }
      }
    });
  } catch (e) {
    NotificationManager.showError(t(`translator.proxyError.createFailed`, String(e)));
    return undefined;
  }
}
