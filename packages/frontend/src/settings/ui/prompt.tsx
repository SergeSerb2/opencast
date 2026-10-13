import { useState, type ReactNode } from "react";
import { create } from "zustand";
import { RpcErrorCode, type NativeParams } from "@opencast/protocol";
import { native } from "../../bridge/native";
import { RpcError } from "../../bridge/errors";
import { Button } from "../../components/Button/Button";
import { TextArea } from "../../components/TextArea/TextArea";
import { TextField } from "../../components/TextField/TextField";
import { Dialog, DialogField } from "./Dialog";

export interface PromptField {
  id: string;
  label: string;
  type?: "text" | "password" | "textarea";
  placeholder?: string;
  value?: string;
  hint?: ReactNode;
  required?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: ReactNode;
  fields: PromptField[];
  primaryTitle?: string;
  /** Return field errors to keep the dialog open. */
  validate?: (values: Record<string, string>) => Record<string, string> | null;
}

interface PendingPrompt {
  id: number;
  options: PromptOptions;
  resolve: (values: Record<string, string> | null) => void;
}

const usePromptStore = create<{ prompt: PendingPrompt | null }>(() => ({ prompt: null }));
let counter = 0;

/** Ask for one or more values in a settings dialog. Resolves null on cancel. */
export function promptForm(options: PromptOptions): Promise<Record<string, string> | null> {
  usePromptStore.getState().prompt?.resolve(null);
  return new Promise((resolve) => {
    const id = ++counter;
    usePromptStore.setState({
      prompt: {
        id,
        options,
        resolve: (values) => {
          usePromptStore.setState((state) => (state.prompt?.id === id ? { prompt: null } : state));
          resolve(values);
        },
      },
    });
  });
}

function PromptDialog({ options, resolve }: { options: PromptOptions; resolve: (values: Record<string, string> | null) => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(options.fields.map((f) => [f.id, f.value ?? ""])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = () => {
    const missing = Object.fromEntries(options.fields.filter((f) => f.required && !values[f.id]?.trim()).map((f) => [f.id, `${f.label} is required`]));
    const problems = Object.keys(missing).length ? missing : (options.validate?.(values) ?? null);
    if (problems && Object.keys(problems).length) return setErrors(problems);
    resolve(values);
  };
  return (
    <Dialog
      title={options.title}
      onClose={() => resolve(null)}
      footer={
        <>
          <Button variant="ghost" onClick={() => resolve(null)}>
            Cancel
          </Button>
          <Button onClick={submit}>{options.primaryTitle ?? "Done"}</Button>
        </>
      }
    >
      <form
        className="sc-s-prompt"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {options.message && <div className="sc-s-dialog-text">{options.message}</div>}
        {options.fields.map((field) => (
          <DialogField key={field.id} label={field.label} hint={field.hint} error={errors[field.id]}>
            {field.type === "textarea" ? (
              <TextArea
                value={values[field.id]}
                onChange={(value) => setValues({ ...values, [field.id]: value })}
                placeholder={field.placeholder}
                minHeight={120}
                maxHeight={260}
                validation={errors[field.id] ? "error" : undefined}
              />
            ) : (
              <TextField
                type={field.type === "password" ? "password" : "text"}
                value={values[field.id]}
                onChange={(value) => setValues({ ...values, [field.id]: value })}
                placeholder={field.placeholder}
                validation={errors[field.id] ? "error" : undefined}
              />
            )}
          </DialogField>
        ))}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Renders the pending `promptForm` (mount once in the Settings window). */
export function PromptHost() {
  const prompt = usePromptStore((state) => state.prompt);
  if (!prompt) return null;
  return <PromptDialog key={prompt.id} options={prompt.options} resolve={prompt.resolve} />;
}

/**
 * Show the native open panel. Without the Swift host (browser development)
 * the user types the path instead. Resolves null when cancelled.
 */
export async function chooseFiles(params: NativeParams<"dialog.openFiles">): Promise<string[] | null> {
  try {
    return await native.call("dialog.openFiles", params);
  } catch (error) {
    if (!(error instanceof RpcError) || error.code !== RpcErrorCode.NativeUnavailable) throw error;
    const kind = params.canChooseDirectories && !params.canChooseFiles ? "Folder" : "File";
    const values = await promptForm({
      title: params.title ?? `Choose ${kind}`,
      message: "The file picker needs the OpenCast app. Enter an absolute path instead.",
      fields: [{ id: "path", label: `${kind} Path`, placeholder: kind === "Folder" ? "/Users/me/Scripts" : "/Users/me/Downloads/export.rayconfig", required: true }],
      primaryTitle: params.prompt ?? "Choose",
      validate: ({ path }) => (path.trim().startsWith("/") || path.trim().startsWith("~") ? null : { path: "Enter an absolute path" }),
    });
    return values ? [values.path.trim()] : null;
  }
}
