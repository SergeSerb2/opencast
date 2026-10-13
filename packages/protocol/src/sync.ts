/** Public ciphertext-only contract for the self-hosted sync service. */
export interface SyncVault {
  vaultId: string;
  keyEpoch: number;
  kdf: { alg: "scrypt"; N: 131072; r: 8; p: 1; salt: string };
  /** ct includes the 16-byte GCM authentication tag. All binary fields are base64url. */
  wrapped: { nonce: string; ct: string };
}

export interface SyncPushRecord {
  rid: string;
  baseSeq: number | null;
  deleted: boolean;
  nonce: string;
  ct: string;
  keyEpoch: number;
}

export interface SyncWireRecord extends Omit<SyncPushRecord, "baseSeq"> {
  seq: number;
}

export type SyncPushResult =
  | { rid: string; status: "ok"; seq: number }
  | { rid: string; status: "conflict"; current: SyncWireRecord };

export interface SyncPullPage {
  records: SyncWireRecord[];
  cursor: number;
  hasMore: boolean;
}

export const SYNC_MAX_RECORDS = 200;
export const SYNC_MAX_REQUEST_BYTES = 4 * 1024 * 1024;
export const SYNC_MAX_CIPHERTEXT_BYTES = 1024 * 1024;
