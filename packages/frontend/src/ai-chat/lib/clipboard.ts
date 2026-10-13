import { native } from "../../bridge/native";

/** Copy plain text through the host pasteboard (browser clipboard in dev). */
export async function copyText(text: string): Promise<void> {
  try {
    await native.call("clipboard.write", { content: { kind: "text", text } });
  } catch {
    await navigator.clipboard?.writeText(text);
  }
}
