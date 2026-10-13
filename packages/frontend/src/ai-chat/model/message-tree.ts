import type { AIMessage } from "@opencast/protocol";

/**
 * A chat stores every branch: editing a user message or regenerating a
 * response adds a sibling under the same parent. The visible transcript is the
 * path from the root to `currentLeafId` (parent pointers, never timestamps).
 */
export interface MessageTree {
  byId: Map<string, AIMessage>;
  /** Children per parent id; root messages are under "". Sorted oldest first. */
  children: Map<string, AIMessage[]>;
}

const ROOT = "";

export function buildMessageTree(messages: readonly AIMessage[]): MessageTree {
  const byId = new Map<string, AIMessage>();
  const children = new Map<string, AIMessage[]>();
  for (const message of messages) byId.set(message.id, message);
  for (const message of messages) {
    // A parent that is not in the list (deleted/unsynced) makes the message a root.
    const key = message.parentId && byId.has(message.parentId) ? message.parentId : ROOT;
    const list = children.get(key);
    if (list) list.push(message);
    else children.set(key, [message]);
  }
  for (const list of children.values()) list.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return { byId, children };
}

function parentKey(tree: MessageTree, message: AIMessage): string {
  return message.parentId && tree.byId.has(message.parentId) ? message.parentId : ROOT;
}

/** Root → leaf path ending at `leafId`. Unknown leaves yield an empty transcript; cycles stop the walk. */
export function visibleBranch(tree: MessageTree, leafId: string | undefined): AIMessage[] {
  const path: AIMessage[] = [];
  const seen = new Set<string>();
  for (let id = leafId; id && !seen.has(id); ) {
    seen.add(id);
    const message = tree.byId.get(id);
    if (!message) break;
    path.push(message);
    id = message.parentId;
  }
  return path.reverse();
}

/** Follow the most recently created child down to a leaf. */
export function latestLeaf(tree: MessageTree, messageId: string): string {
  let id = messageId;
  const seen = new Set<string>([id]);
  for (;;) {
    const kids = tree.children.get(id);
    const next = kids?.[kids.length - 1];
    if (!next || seen.has(next.id)) return id;
    seen.add(next.id);
    id = next.id;
  }
}

/** Leaf to show when the chat has no (valid) `currentLeafId`: the newest message's branch. */
export function fallbackLeaf(tree: MessageTree): string | undefined {
  let newest: AIMessage | undefined;
  for (const message of tree.byId.values()) if (!newest || message.createdAt > newest.createdAt) newest = message;
  return newest ? latestLeaf(tree, newest.id) : undefined;
}

export interface BranchInfo {
  /** 0-based position among siblings. */
  index: number;
  count: number;
  /** Leaf to select for the previous/next sibling's branch. */
  previousLeaf?: string;
  nextLeaf?: string;
}

/** Position of `message` among its siblings (alternative edits or regenerations). */
export function branchInfo(tree: MessageTree, message: AIMessage): BranchInfo {
  const siblings = tree.children.get(parentKey(tree, message)) ?? [message];
  const index = Math.max(0, siblings.findIndex((m) => m.id === message.id));
  const previous = siblings[index - 1];
  const next = siblings[index + 1];
  return {
    index,
    count: siblings.length,
    previousLeaf: previous ? latestLeaf(tree, previous.id) : undefined,
    nextLeaf: next ? latestLeaf(tree, next.id) : undefined,
  };
}

/** The leaf to display for a chat: its `currentLeafId` when valid, otherwise the newest branch. */
export function resolveLeaf(tree: MessageTree, currentLeafId: string | undefined): string | undefined {
  return currentLeafId && tree.byId.has(currentLeafId) ? currentLeafId : fallbackLeaf(tree);
}
