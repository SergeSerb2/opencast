import type { ClipboardItem } from "@surgecast/protocol";
import { useRef, useState } from "react";
import { backend } from "../../../bridge/backend";
import { Action, ActionPanel, Form, showFailureToast, showToast, useNavigation } from "../../../components";

export function ClipboardEditView({ item, renameOnly = false }: { item: ClipboardItem; renameOnly?: boolean }) {
  const navigation = useNavigation();
  const [title, setTitle] = useState(item.title);
  const [text, setText] = useState(item.text ?? "");
  const [error, setError] = useState<string>();
  const saving = useRef(false);
  const save = async () => {
    if (!title.trim()) return setError("Name is required");
    if (saving.current) return;
    saving.current = true;
    try {
      await backend.call("clipboard.update", { id: item.id, patch: { title: title.trim(), ...(renameOnly ? {} : { text }) } });
      navigation.pop();
      showToast({ style: "success", title: "Updated clipboard entry" });
    } catch (error) {
      showFailureToast("Failed to update entry", error);
    } finally {
      saving.current = false;
    }
  };
  return (
    <Form navigationTitle={renameOnly ? "Rename Entry" : "Edit Entry"} actions={<ActionPanel><Action title="Save Entry" icon="checkmark-16" onAction={save} /></ActionPanel>}>
      <Form.TextField id="title" title="Name" value={title} onChange={(value) => { setTitle(value); setError(undefined); }} error={error} />
      {!renameOnly && <Form.TextArea id="text" title="Text" value={text} onChange={setText} />}
    </Form>
  );
}
