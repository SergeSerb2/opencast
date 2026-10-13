import { useState } from "react";
import type { ImageLike } from "@opencast/protocol";
import { Action, ActionPanel, Form } from "../../../components";

export interface TemplateArgument {
  name: string;
  default?: string;
  options?: string[];
}

export interface ArgumentsFormProps {
  args: TemplateArgument[];
  submitTitle: string;
  navigationTitle: string;
  navigationIcon?: ImageLike;
  onSubmit: (values: Record<string, string>) => unknown;
}

/** Fill in `{argument}` placeholders of a snippet or quicklink before using it. */
export function ArgumentsForm({ args, submitTitle, navigationTitle, navigationIcon, onSubmit }: ArgumentsFormProps) {
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const submit = (values: Record<string, unknown>) => {
    const strings = Object.fromEntries(args.map((a) => [a.name, String(values[a.name] ?? "")]));
    const missing = Object.fromEntries(args.filter((a) => a.default === undefined && !strings[a.name].trim()).map((a) => [a.name, "Required"]));
    setErrors(missing);
    if (Object.keys(missing).length) return;
    return onSubmit(strings);
  };
  return (
    <Form
      navigationTitle={navigationTitle}
      navigationIcon={navigationIcon}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={submitTitle} onSubmit={submit} />
        </ActionPanel>
      }
    >
      {args.map((arg) =>
        arg.options?.length ? (
          <Form.Dropdown key={arg.name} id={arg.name} title={arg.name} defaultValue={arg.default ?? arg.options[0]}>
            {arg.options.map((option) => (
              <Form.Dropdown.Item key={option} value={option} title={option} />
            ))}
          </Form.Dropdown>
        ) : (
          <Form.TextField
            key={arg.name}
            id={arg.name}
            title={arg.name}
            placeholder={arg.default ? arg.default : arg.name}
            defaultValue={arg.default ?? ""}
            error={errors[arg.name]}
            onChange={() => errors[arg.name] && setErrors((e) => ({ ...e, [arg.name]: undefined }))}
          />
        ),
      )}
    </Form>
  );
}
