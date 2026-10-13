import { expect, it } from "vitest";
import { createServer } from "node:http";
import { connect } from "node:net";
import { networkDispatcher, systemProxies } from "../src/services/network";
it("uses only enabled system proxy endpoints and translates exception suffixes", () => {
  expect(systemProxies(`<dictionary> {
    HTTPEnable : 1
    HTTPProxy : 127.0.0.1
    HTTPPort : 8888
    HTTPSEnable : 0
    HTTPSProxy : disabled.example
    HTTPSPort : 9999
    ExceptionsList : <array> {
      0 : *.local
      1 : 127.0.0.1
    }
  }`)).toEqual({ httpProxy: "http://127.0.0.1:8888/", httpsProxy: undefined, noProxy: ".local,127.0.0.1" });
  expect(systemProxies("HTTPEnable : 0")).toEqual({ httpProxy: undefined, httpsProxy: undefined, noProxy: "" });
});

it("routes backend HTTP through a configured loopback proxy instead of resolving the destination", async () => {
  const target = createServer((_req, response) => { response.setHeader("Connection", "close"); response.end("proxied"); });
  const proxy = createServer();
  const sockets = new Set<{ destroy(): unknown }>();
  let destination = "";
  const listen = (server: ReturnType<typeof createServer>) => new Promise<number>(resolve => server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port)));
  const targetPort = await listen(target);
  proxy.on("connect", (request, socket, head) => {
    destination = request.url!;
    sockets.add(socket);
    const upstream = connect(targetPort, "127.0.0.1", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      socket.pipe(upstream); upstream.pipe(socket);
    });
    sockets.add(upstream);
  });
  const port = await listen(proxy);
  const dispatcher = networkDispatcher({ httpProxy: `http://127.0.0.1:${port}` });
  try {
    const response = await dispatcher.request({ origin: "http://example.invalid", path: "/test", method: "GET" });
    expect(await response.body.text()).toBe("proxied");
    expect(destination).toBe("example.invalid:80");
  } finally {
    await dispatcher.close();
    for (const socket of sockets) socket.destroy();
    await Promise.all([new Promise<void>(resolve => target.close(() => resolve())), new Promise<void>(resolve => proxy.close(() => resolve()))]);
  }
});
