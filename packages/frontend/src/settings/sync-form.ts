export interface SyncSetup {
  serverUrl: string;
  token: string;
  passphrase: string;
  confirmPassphrase: string;
  /** First device: a new vault is created, so the passphrase is entered twice. */
  createVault: boolean;
  deviceName: string;
}

/** Shortest passphrase accepted when creating a vault (the server only sees a scrypt-wrapped key). */
export const MIN_NEW_PASSPHRASE = 12;
const MAX_PASSPHRASE = 4096;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Problems with the Cloud Sync setup form, keyed by field; empty when it can be submitted. */
export function validateSyncSetup(form: SyncSetup): Partial<Record<keyof SyncSetup, string>> {
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
  if (!form.token.trim()) errors.token = "Paste the access token from the deploy script";
  if (!form.passphrase) errors.passphrase = "Enter the vault passphrase";
  else if (form.passphrase.length > MAX_PASSPHRASE) errors.passphrase = "Use at most 4096 characters";
  else if (form.createVault && form.passphrase.length < MIN_NEW_PASSPHRASE) errors.passphrase = `Use at least ${MIN_NEW_PASSPHRASE} characters`;
  if (form.createVault && !errors.passphrase && form.confirmPassphrase !== form.passphrase) errors.confirmPassphrase = "Passphrases don't match";
  if (form.deviceName.trim().length > 64) errors.deviceName = "Use at most 64 characters";
  return errors;
}
