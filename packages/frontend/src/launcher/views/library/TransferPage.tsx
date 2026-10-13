import type { ReactNode } from "react";
import type { ImageLike } from "@opencast/protocol";
import { useRegisterActions, ViewFrame, type ActionsProp } from "../../../components";
import { Image } from "../../../icons/Image";
import "./transfer-page.css";

export interface TransferPageProps {
  navigationTitle: string;
  navigationIcon?: ImageLike;
  icon?: ImageLike;
  title: string;
  /** One or more status lines under the title. */
  lines: { text: string; tone?: "default" | "success" | "warning" }[];
  actions: ActionsProp;
  isLoading?: boolean;
}

/** Centered import/export page: large icon, title and status lines (Raycast's Import/Export Snippets layout). */
export function TransferPage({ navigationTitle, navigationIcon, icon, title, lines, actions, isLoading }: TransferPageProps) {
  return (
    <ViewFrame navigationTitle={navigationTitle} navigationIcon={navigationIcon} isLoading={isLoading}>
      <TransferBody icon={icon ?? navigationIcon} title={title} lines={lines} actions={actions} />
    </ViewFrame>
  );
}

function TransferBody({ icon, title, lines, actions }: Pick<TransferPageProps, "icon" | "title" | "lines" | "actions">): ReactNode {
  useRegisterActions(actions);
  return (
    <div className="sc-transfer" role="status">
      {icon && <Image source={icon} size={54} className="sc-transfer__icon" />}
      <h1 className="sc-transfer__title">{title}</h1>
      <div className="sc-transfer__lines">
        {lines.map((line, i) => (
          <p key={i} className="sc-transfer__line" data-tone={line.tone ?? "default"}>
            {line.text}
          </p>
        ))}
      </div>
    </div>
  );
}
