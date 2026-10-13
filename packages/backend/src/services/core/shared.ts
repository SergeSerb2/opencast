import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { AppContext } from "../../context";
import { RpcError } from "../../util/errors";

function entityData<T>(record: {
  data: T;
  createdAt: number;
  updatedAt: number;
}): T {
  return record.data &&
    typeof record.data === "object" &&
    "createdAt" in record.data
    ? {
        ...record.data,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }
    : record.data;
}
export function list<T>(ctx: AppContext, collection: string): T[] {
  return ctx.entities.list<T>(collection).map((r) => entityData(r));
}
export function requireEntity<T>(
  ctx: AppContext,
  collection: string,
  id: string,
): T {
  const record = ctx.entities.get<T>(collection, id);
  if (!record) throw RpcError.notFound(`${collection}/${id}`);
  return entityData(record);
}
export function save<
  T extends { id: string; createdAt: number; updatedAt: number },
>(ctx: AppContext, collection: string, value: T): T {
  const record = ctx.entities.put(collection, value.id, {
    ...value,
    updatedAt: Date.now(),
  });
  return { ...value, createdAt: record.createdAt, updatedAt: record.updatedAt };
}
export function stamp() {
  const now = Date.now();
  return { id: randomUUID(), createdAt: now, updatedAt: now };
}
export function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw RpcError.invalidParams(`${label} must be nonempty text`);
  return value;
}
export function boundedLimit(
  value: number | undefined,
  fallback = 50,
  maximum = 1000,
): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(maximum, Math.floor(value!)))
    : fallback;
}
export function expandPath(path: string): string {
  return resolve(path.replace(/^~(?=\/|$)/, homedir()));
}
export function ftsQuery(query: string): string {
  return (
    query
      .match(/[\p{L}\p{N}_]+/gu)
      ?.map((word) => `"${word}"*`)
      .join(" AND ") ?? ""
  );
}
export function observeCollection(
  ctx: AppContext,
  collection: string,
  changed: (id: string, deleted: boolean) => void,
): void {
  ctx.onShutdown(
    ctx.entities.onChange((c) => {
      if (c.collection === collection) changed(c.id, c.kind === "delete");
    }),
  );
}
export function background(
  ctx: AppContext,
  operation: Promise<unknown>,
  label: string,
): void {
  void operation.catch(() => ctx.log.warn(`${label} failed`));
}
export function importRows(json: string, key: string): unknown[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw RpcError.invalidParams("Invalid JSON");
  }
  if (Array.isArray(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as Record<string, unknown>)[key])
  )
    return (value as Record<string, unknown>)[key] as unknown[];
  throw RpcError.invalidParams(`Expected an array or { ${key}: [] }`);
}
