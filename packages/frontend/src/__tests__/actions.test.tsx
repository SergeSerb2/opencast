import { describe, expect, it, vi } from "vitest";
import { Action } from "../components/actions/Action";
import { ActionPanel, collectActions } from "../components/actions/ActionPanel";
import { actionsWithShortcuts, primaryActions } from "../components/actions/model";
import { actionsSignature } from "../components/View/useRegisterActions";
import { sc } from "../lib/keyboard";

const context = { push: vi.fn(), getFormValues: () => ({ title: "Hello" }) };

describe("collectActions", () => {
  it("turns ActionPanel JSX into sections with primary/secondary", () => {
    const run = vi.fn();
    const model = collectActions(
      <ActionPanel title="Item">
        <Action title="Open" onAction={run} />
        <>
          <Action.CopyToClipboard content="x" shortcut={sc("cmd", "c")} />
        </>
        <ActionPanel.Section title="Danger">
          <Action title="Delete" style="destructive" shortcut={sc("ctrl", "x")} />
          <ActionPanel.Submenu title="Move">
            <Action title="Inbox" shortcut={sc("cmd", "1")} />
          </ActionPanel.Submenu>
        </ActionPanel.Section>
      </ActionPanel>,
      context,
    );
    expect(model?.title).toBe("Item");
    expect(model?.sections.map((s) => s.title)).toEqual([undefined, "Danger"]);
    const { primary, secondary } = primaryActions(model);
    expect(primary?.title).toBe("Open");
    expect(secondary?.title).toBe("Copy to Clipboard");
    primary?.onAction?.();
    expect(run).toHaveBeenCalled();
    expect(actionsWithShortcuts(model).map((a) => a.title)).toEqual(["Copy to Clipboard", "Delete", "Inbox"]);
  });

  it("wires Push and SubmitForm to the context", () => {
    const onSubmit = vi.fn();
    const model = collectActions(
      <ActionPanel>
        <Action.SubmitForm onSubmit={onSubmit} />
        <Action.Push title="Details" target={<div />} />
      </ActionPanel>,
      context,
    );
    const [submit, push] = model!.sections[0].actions;
    submit.onAction?.();
    expect(onSubmit).toHaveBeenCalledWith({ title: "Hello" });
    push.onAction?.();
    expect(context.push).toHaveBeenCalled();
  });

  it("passes models through and ignores other elements", () => {
    const model = { sections: [{ actions: [{ id: "a", title: "A" }] }] };
    expect(collectActions(model, context)).toBe(model);
    expect(collectActions(<div />, context)).toBeNull();
  });

  it("signature ignores callbacks but tracks rows", () => {
    const a = { sections: [{ actions: [{ id: "a", title: "A", onAction: () => 1 }] }] };
    const b = { sections: [{ actions: [{ id: "a", title: "A", onAction: () => 2 }] }] };
    const c = { sections: [{ actions: [{ id: "a", title: "B" }] }] };
    expect(actionsSignature(a)).toBe(actionsSignature(b));
    expect(actionsSignature(a)).not.toBe(actionsSignature(c));
  });
});
