import { describe, expect, it } from "vitest";
import type { AIMessage } from "@surgecast/protocol";
import { branchInfo, buildMessageTree, fallbackLeaf, latestLeaf, resolveLeaf, visibleBranch } from "../ai-chat/model/message-tree";

let clock = 0;
const msg = (id: string, parentId: string | undefined, role: AIMessage["role"] = "user"): AIMessage => ({ id, chatId: "c", parentId, role, content: id, status: "complete", createdAt: ++clock, updatedAt: clock });

// u1 → a1 → u2 → a2
//          ↘ u2b → a2b      (edit of u2)
//    → a1b                  (regeneration of a1)
const messages = [msg("u1", undefined), msg("a1", "u1", "assistant"), msg("u2", "a1"), msg("a2", "u2", "assistant"), msg("u2b", "a1"), msg("a2b", "u2b", "assistant"), msg("a1b", "u1", "assistant")];
const tree = buildMessageTree(messages);

describe("visibleBranch", () => {
  it("follows parent pointers from the leaf to the root", () => {
    expect(visibleBranch(tree, "a2").map((m) => m.id)).toEqual(["u1", "a1", "u2", "a2"]);
    expect(visibleBranch(tree, "a2b").map((m) => m.id)).toEqual(["u1", "a1", "u2b", "a2b"]);
  });

  it("is empty for unknown leaves and stops on cycles", () => {
    expect(visibleBranch(tree, "missing")).toEqual([]);
    expect(visibleBranch(tree, undefined)).toEqual([]);
    const cyclic = buildMessageTree([{ ...msg("x", "y"), createdAt: 1 }, { ...msg("y", "x"), createdAt: 2 }]);
    expect(visibleBranch(cyclic, "x").map((m) => m.id)).toEqual(["y", "x"]);
  });

  it("treats messages whose parent is missing as roots", () => {
    const orphan = buildMessageTree([msg("o", "deleted")]);
    expect(orphan.children.get("")?.map((m) => m.id)).toEqual(["o"]);
  });
});

describe("branches", () => {
  it("reports position among siblings and the leaves to switch to", () => {
    const u2 = tree.byId.get("u2")!;
    expect(branchInfo(tree, u2)).toEqual({ index: 0, count: 2, previousLeaf: undefined, nextLeaf: "a2b" });
    const u2b = tree.byId.get("u2b")!;
    expect(branchInfo(tree, u2b)).toEqual({ index: 1, count: 2, previousLeaf: "a2", nextLeaf: undefined });
  });

  it("switching to a regeneration lands on its own leaf", () => {
    const a1b = tree.byId.get("a1b")!;
    expect(branchInfo(tree, a1b)).toMatchObject({ index: 1, count: 2, previousLeaf: "a2b" });
  });

  it("descends through the newest child", () => {
    expect(latestLeaf(tree, "u1")).toBe("a1b");
    expect(latestLeaf(tree, "a1")).toBe("a2b");
    expect(latestLeaf(tree, "a2")).toBe("a2");
  });

  it("falls back to the newest branch without a valid current leaf", () => {
    expect(fallbackLeaf(tree)).toBe("a1b");
    expect(resolveLeaf(tree, "a2")).toBe("a2");
    expect(resolveLeaf(tree, "gone")).toBe("a1b");
    expect(resolveLeaf(buildMessageTree([]), undefined)).toBeUndefined();
  });
});
