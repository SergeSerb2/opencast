/** One hibernating WebSocket hub per account; D1 remains the source of truth. */
export class SyncNotifier implements DurableObject {
  constructor(private readonly state: DurableObjectState) {}
  async fetch(request: Request): Promise<Response> {
    if (request.method === "POST") {
      const data = await request.json() as { type: string; seq?: number; deviceId?: string };
      for (const socket of this.state.getWebSockets()) {
        try {
          const device = socket.deserializeAttachment() as string;
          if (data.type === "wipe" || (data.type === "revoked" && data.deviceId === device)) socket.close(4003, "Device removed");
          else socket.send(JSON.stringify({ type: "changed", seq: data.seq ?? 0 }));
        } catch { try { socket.close(1011, "Connection unavailable"); } catch {} }
      }
      return Response.json({ ok: true });
    }
    const pair = new WebSocketPair();
    pair[1].serializeAttachment((request.headers.get("X-OpenCast-Device") ?? request.headers.get("X-Surgecast-Device")));
    this.state.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage(_socket: WebSocket, _message: string | ArrayBuffer): void {}
  webSocketClose(socket: WebSocket, code: number): void { try { socket.close(code); } catch {} }
  webSocketError(socket: WebSocket): void { try { socket.close(1011, "Connection error"); } catch {} }
}
