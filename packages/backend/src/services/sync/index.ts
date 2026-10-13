import type { Service } from "../../context";

/** End-to-end encrypted Cloud Sync client for the self-hosted Cloudflare Worker. */
export const syncService: Service = {
  name: "sync",
  register() {},
};
