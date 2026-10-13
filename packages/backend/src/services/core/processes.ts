import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename } from "node:path";
import type { ProcessInfo } from "@opencast/protocol";
import type { Service } from "../../context";
import { RpcError } from "../../util/errors";
const exec = promisify(execFile);
export function parseProcessList(output: string): ProcessInfo[] {
  return output.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+([\d.]+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    return match
      ? [
          {
            pid: Number(match[1]),
            cpuPercent: Number(match[2]),
            memoryBytes: Number(match[3]) * 1024,
            name: basename(match[4]),
            executable: match[4],
          },
        ]
      : [];
  });
}
export const processesService: Service = {
  name: "core.processes",
  register(ctx) {
    const processes = async (): Promise<ProcessInfo[]> => {
      const [apps, { stdout }] = await Promise.all([
        ctx.native.call("apps.running", undefined),
        exec("/bin/ps", ["-axo", "pid=,pcpu=,rss=,comm="], {
          maxBuffer: 4 * 1024 * 1024,
          timeout: 5000,
        }),
      ]);
      const appByPid = new Map(apps.map((app) => [app.pid, app]));
      return parseProcessList(stdout)
        .filter((p) => p.pid !== process.pid)
        .map((p) => ({
          ...p,
          app: appByPid.get(p.pid),
          name: appByPid.get(p.pid)?.name ?? p.name,
        }))
        .sort(
          (a, b) =>
            Number(!!b.app) - Number(!!a.app) ||
            b.cpuPercent - a.cpuPercent ||
            a.name.localeCompare(b.name),
        );
    };
    ctx.rpc.handleAll({
      "system.processes": processes,
      "system.killProcess": async ({ pid, force = false }) => {
        if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid)
          throw RpcError.invalidParams(
            "Choose a valid process other than OpenCast",
          );
        const list = await processes();
        const target = list.find((p) => p.pid === pid);
        if (!target) throw RpcError.notFound(`Process ${pid}`);
        if (target.app)
          await ctx.native.call("apps.quit", {
            bundleIdOrPath: target.app.bundleId ?? target.app.path,
            force,
          });
        else {
          try {
            process.kill(pid, force ? "SIGKILL" : "SIGTERM");
          } catch {
            throw RpcError.invalidParams(
              "Cannot terminate this process; it may have exited or belong to another user",
            );
          }
        }
      },
    });
  },
};
