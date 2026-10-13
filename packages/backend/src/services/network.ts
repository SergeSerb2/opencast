import { readFile } from "node:fs/promises";
import { rootCertificates } from "node:tls";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Agent, EnvHttpProxyAgent, getGlobalDispatcher, setGlobalDispatcher, type Dispatcher } from "undici";
import type { Service } from "../context";
const exec = promisify(execFile);
export function systemProxies(output: string): { httpProxy?: string; httpsProxy?: string; noProxy?: string } {
  const value = (key: string) => output.match(new RegExp(`^\\s*${key} : (.+)$`, "m"))?.[1]?.trim();
  const proxy = (prefix: string) => {
    if (value(`${prefix}Enable`) !== "1") return undefined;
    const host = value(`${prefix}Proxy`), port = value(`${prefix}Port`);
    if (!host || !/^\d+$/.test(port ?? "")) return undefined;
    const url = new URL(`http://${host.includes(":") ? `[${host}]` : host}:${port}`);
    return url.href;
  };
  const exceptions = output.match(/ExceptionsList : <array> \{([\s\S]*?)\}/)?.[1] ?? "";
  const noProxy = [...exceptions.matchAll(/\d+ : (.+)/g)].map(match => match[1].trim().replace(/^\*\./, ".")).join(",");
  return { httpProxy: proxy("HTTP"), httpsProxy: proxy("HTTPS"), noProxy };
}
export function networkDispatcher(proxies: { httpProxy?: string; httpsProxy?: string; noProxy?: string }, extra: string[] = []): Dispatcher {
  const ca = extra.length ? [...rootCertificates, ...extra] : undefined;
  return proxies.httpProxy || proxies.httpsProxy
    ? new EnvHttpProxyAgent({ httpProxy: proxies.httpProxy ?? "", httpsProxy: proxies.httpsProxy ?? "", noProxy: proxies.noProxy ?? "", requestTls: { ca }, proxyTls: { ca } })
    : new Agent({ connect: { ca } });
}
/** Node's built-in fetch uses the same global Undici dispatcher. TLS stays verified. */
export const networkService: Service = {
  name: "network",
  register(ctx) {
    const original = getGlobalDispatcher();
    let active: Dispatcher | undefined;
    let queue = Promise.resolve();
    const configure = async () => {
      const paths = ctx.settings.get("advanced.additionalCertificateAuthorities");
      const extra = await Promise.all(paths.map(path => readFile(path, "utf8")));
      if (extra.some(pem => !pem.includes("-----BEGIN CERTIFICATE-----"))) throw new Error("Invalid certificate authority file");
      let proxies: { httpProxy?: string; httpsProxy?: string; noProxy?: string } = {};
      if (ctx.settings.get("advanced.useSystemProxySettings") && process.platform === "darwin")
        proxies = systemProxies((await exec("/usr/sbin/scutil", ["--proxy"], { timeout: 5000 })).stdout);
      const next = networkDispatcher(proxies, extra);
      const previous = active;
      setGlobalDispatcher(next); active = next;
      await previous?.close();
    };
    const refresh = () => queue = queue.then(configure).catch(() => { ctx.log.warn("Network settings could not be applied"); });
    ctx.onReady(refresh);
    ctx.onShutdown(ctx.settings.onChange(key => { if (key === "advanced.useSystemProxySettings" || key === "advanced.additionalCertificateAuthorities") void refresh(); }));
    ctx.onShutdown(async () => { await queue; setGlobalDispatcher(original); await active?.close(); });
  },
};
