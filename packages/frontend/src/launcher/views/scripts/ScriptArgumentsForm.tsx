import { useState } from "react";
import type { ImageLike, ScriptCommand } from "@opencast/protocol";
import { Action, ActionPanel, Form, showToast, useNavigation } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { argumentValues, firstMissingArgument } from "./script-list";

export interface ScriptArgumentsFormProps {
  script: ScriptCommand;
  icon?: ImageLike;
  /** Called with positional values after the form pops itself. */
  onSubmit: (values: string[]) => void;
}

/** Asks for a script's arguments when they are not known (Run Again after a launch from root search). */
export function ScriptArgumentsForm({ script, icon, onSubmit }: ScriptArgumentsFormProps) {
  const navigation = useNavigation();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (raw: Record<string, unknown>) => {
    const values = Object.fromEntries(script.arguments.map((a) => [a.name, typeof raw[a.name] === "string" ? (raw[a.name] as string) : ""]));
    const missing = firstMissingArgument(script, values);
    if (missing >= 0) {
      const argument = script.arguments[missing];
      setErrors({ [argument.name]: "Required" });
      showToast({ style: "failure", title: `${argument.placeholder || "Argument"} is required` });
      return;
    }
    navigation.pop();
    onSubmit(argumentValues(script, values));
  };

  const clear = (name: string) => setErrors((prev) => (prev[name] ? { ...prev, [name]: "" } : prev));

  return (
    <Form
      navigationTitle={script.title}
      navigationIcon={icon}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Run Script" icon="play-16" shortcut={sc("cmd", "return")} onSubmit={submit} />
        </ActionPanel>
      }
    >
      {script.arguments.map((argument, index) => {
        const title = argument.placeholder || `Argument ${index + 1}`;
        const common = { id: argument.name, title, error: errors[argument.name] || undefined, onChange: () => clear(argument.name) };
        if (argument.type === "dropdown")
          return (
            <Form.Dropdown key={argument.name} {...common} defaultValue={argument.required === false ? "" : undefined}>
              {argument.required === false && <Form.Dropdown.Item value="" title="None" />}
              {(argument.data ?? []).map((option) => (
                <Form.Dropdown.Item key={option.value} value={option.value} title={option.title} />
              ))}
            </Form.Dropdown>
          );
        if (argument.type === "password") return <Form.PasswordField key={argument.name} {...common} placeholder={argument.required === false ? "Optional" : undefined} />;
        return <Form.TextField key={argument.name} {...common} placeholder={argument.required === false ? "Optional" : undefined} />;
      })}
    </Form>
  );
}
