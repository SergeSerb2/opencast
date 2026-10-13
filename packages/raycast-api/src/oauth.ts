import { createHash, randomBytes } from "node:crypto";
import { registerCallback, removeCallback, request } from "./bridge";
export const RedirectMethod = { Web: "web", App: "app", AppURI: "appURI", ClientIdMetadataDocument: "clientIdMetadataDocument" } as const;
export class TokenSet {
  accessToken: string; refreshToken?: string; idToken?: string; expiresIn?: number; scope?: string; updatedAt: Date;
  constructor(input: any) {
    this.accessToken = input.accessToken ?? input.access_token;
    if (!this.accessToken) throw new Error("OAuth tokens require an access token");
    this.refreshToken = input.refreshToken ?? input.refresh_token;
    this.idToken = input.idToken ?? input.id_token;
    this.expiresIn = input.expiresIn ?? input.expires_in;
    const scope = input.scope;
    this.scope = Array.isArray(scope) ? scope.join(" ") : scope;
    this.updatedAt = input.updatedAt ? new Date(input.updatedAt) : new Date();
  }
  isExpired(): boolean { return this.expiresIn !== undefined && Date.now() >= this.updatedAt.getTime() + (this.expiresIn - 10) * 1000; }
}
class PKCEClient {
  readonly redirectMethod: string;
  readonly providerName: string;
  readonly providerId: string;
  readonly providerIcon: any;
  readonly description?: string;
  private redirectId?: string;
  private response?: { authorizationCode: string };
  private responseError?: Error;
  private resolve?: (response: { authorizationCode: string }) => void;
  private reject?: (error: Error) => void;
  private authorizing = false;
  constructor(options: { redirectMethod: string; providerName: string; providerId?: string; providerIcon?: any; description?: string }) {
    this.redirectMethod = options.redirectMethod; this.providerName = options.providerName;
    this.providerId = options.providerId ?? "default"; this.providerIcon = options.providerIcon; this.description = options.description;
  }
  async authorizationRequest(options: { endpoint: string; clientId?: string; scope: string; extraParameters?: Record<string, string> }) {
    if (this.redirectId) removeCallback(this.redirectId);
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    this.response = undefined; this.responseError = undefined;
    this.redirectId = registerCallback((response: any) => {
      if (response.error) { this.responseError = new Error(response.error); this.reject?.(this.responseError); }
      else { this.response = response; this.resolve?.(response); }
    });
    const init = await request("initOAuth", { flow: "PKCE", redirectMethod: this.redirectMethod, providerName: this.providerName, providerId: this.providerId, onRedirect: this.redirectId, description: this.description });
    if (!options.clientId) throw new Error("OAuth requires your provider's clientId; OpenCast does not use Raycast OAuth servers or metadata");
    const result = { clientId: options.clientId, codeVerifier, codeChallenge, state: init.state, redirectURI: init.redirectURI, toURL: () => {
      const url = new URL(options.endpoint);
      for (const [key, value] of Object.entries({ client_id: options.clientId!, redirect_uri: init.redirectURI, response_type: "code", scope: options.scope, code_challenge: codeChallenge, code_challenge_method: "S256", state: init.state, ...options.extraParameters })) url.searchParams.set(key, String(value));
      return url.href;
    } };
    return result;
  }
  async authorize(options: { url: string } | { toURL(): string }): Promise<{ authorizationCode: string }> {
    if (this.authorizing) throw new Error("OAuth authorization is already in progress");
    if (!this.redirectId) throw new Error("Call authorizationRequest before authorize");
    this.authorizing = true;
    try {
      const response = new Promise<{ authorizationCode: string }>((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
      await request("authorizeOAuth", { url: "toURL" in options ? options.toURL() : options.url });
      if (this.responseError) throw this.responseError;
      return this.response ?? await response;
    } finally { this.authorizing = false; this.resolve = undefined; this.reject = undefined; if (this.redirectId) removeCallback(this.redirectId); }
  }
  setTokens(input: any): Promise<void> { return request("setOAuthTokens", { providerId: this.providerId, tokenSet: new TokenSet(input) }); }
  async getTokens(): Promise<TokenSet | undefined> { const result = await request("getOAuthTokens", { providerId: this.providerId }); return result.tokenSet ? new TokenSet(result.tokenSet) : undefined; }
  removeTokens(): Promise<void> { return request("removeOAuthTokens", { providerId: this.providerId }); }
}
export const OAuth = { PKCEClient, TokenSet, RedirectMethod, clientIdMetadataDocument: "opencast://oauth-client-metadata" };
