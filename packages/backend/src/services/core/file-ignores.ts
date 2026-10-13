import { readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import ignore from "ignore";
/** Nested ignore files apply from parent to child, including ordered negations. */
export async function matchesIgnoreFiles(path: string, root: string, cache = new Map<string, Promise<string[]>>()): Promise<boolean> {
  const rel = relative(root, path);
  if (!rel || rel.startsWith(`..${sep}`)) return false;
  const parent = dirname(rel), parts = parent === "." ? [] : parent.split(sep);
  let directory = root, excluded = false;
  for (let i = 0; i <= parts.length; i++) {
    let rules = cache.get(directory);
    if (!rules) {
      rules = Promise.all([".gitignore", ".ignore", ".rayignore"].map(file => readFile(join(directory, file), "utf8").catch(() => "")));
      cache.set(directory, rules);
    }
    const result = ignore().add(await rules).test(relative(directory, path).split(sep).join("/"));
    if (result.ignored) excluded = true;
    if (result.unignored) excluded = false;
    directory = join(directory, parts[i] ?? "");
  }
  return excluded;
}
