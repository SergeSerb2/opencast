export interface SyncSetup {
  serverUrl: string;
  token: string;
  passphrase: string;
  confirmPassphrase: string;
  /** Legacy form callers can still select create validation; the page uses its probe result. */
  createVault?: boolean;
  deviceName: string;
}

/** Shortest passphrase accepted when creating a vault (the server only sees a scrypt-wrapped key). */
export const MIN_NEW_PASSPHRASE = 12;
const MAX_PASSPHRASE = 4096;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Step one validates credentials before contacting the server. */
export function validateSyncCredentials(form: Pick<SyncSetup, "serverUrl" | "token">): Partial<Record<keyof SyncSetup, string>> {
  const errors: Partial<Record<keyof SyncSetup, string>> = {};
  const url = form.serverUrl.trim();
  if (!url) errors.serverUrl = "Enter your sync server's URL";
  else {
    try {
      const parsed = new URL(url);
      if (parsed.username || parsed.password) errors.serverUrl = "Remove the user name and password from the URL";
      else if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && LOCAL_HOSTS.has(parsed.hostname))) errors.serverUrl = "Use an https:// URL (http:// only works for localhost)";
      else if (parsed.search || parsed.hash) errors.serverUrl = "Use the server's base URL, without ? or #";
    } catch {
      errors.serverUrl = "That isn't a valid URL";
    }
  }
  if (!form.token.trim()) errors.token = "Paste your server access token";
  else if (form.token.length > 4096 || /[\r\n]/.test(form.token)) errors.token = "Use a token of at most 4096 characters, without line breaks";
  return errors;
}

/** The probe result selects validation; joining never changes an existing passphrase. */
export function validateSyncSetup(form: SyncSetup, mode: "create" | "join" = form.createVault ? "create" : "join"): Partial<Record<keyof SyncSetup, string>> {
  const errors = validateSyncCredentials(form);
  if (!form.passphrase) errors.passphrase = "Enter the vault passphrase";
  else if (form.passphrase.length > MAX_PASSPHRASE) errors.passphrase = "Use at most 4096 characters";
  else if (mode === "create" && form.passphrase.length < MIN_NEW_PASSPHRASE) errors.passphrase = `Use at least ${MIN_NEW_PASSPHRASE} characters`;
  if (mode === "create" && !errors.passphrase && form.confirmPassphrase !== form.passphrase) errors.confirmPassphrase = "Passphrases don't match";
  if (form.deviceName.trim().length > 64) errors.deviceName = "Use at most 64 characters";
  return errors;
}

/** A local hint, not a password estimator. Never sent to the backend. */
export function passphraseStrength(passphrase: string): { score: number; label: string } {
  if (!passphrase) return { score: 0, label: "At least 12 characters" };
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter(pattern => pattern.test(passphrase)).length;
  const weak = /(.)\1{3,}/u.test(passphrase) || /password|opencast|1234/i.test(passphrase);
  if (passphrase.length < MIN_NEW_PASSPHRASE) return { score: 0, label: "Too short" };
  if (weak || passphrase.length < 16 || classes < 2) return { score: 1, label: "Try more random words" };
  if (passphrase.length < 24 || classes < 3) return { score: 2, label: "Good length" };
  return { score: 3, label: "Strong length and variety" };
}
