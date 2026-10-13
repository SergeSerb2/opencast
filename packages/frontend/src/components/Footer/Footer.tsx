import { memo, type ReactNode } from "react";
import type { ImageLike } from "@surgecast/protocol";
import { MenuGlyph } from "../../icons/glyphs";
import { Image } from "../../icons/Image";
import { sc } from "../../lib/keyboard";
import { primaryActions, flattenActions, type ActionModel, type ActionPanelModel } from "../actions/model";
import { useToastStore } from "../feedback/toast-store";
import { ActionButton } from "./ActionButton";
import { FooterToast } from "./FooterToast";
import "./footer.css";

const ENTER = sc("return");
const CMD_ENTER = sc("cmd", "return");
const CMD_K = sc("cmd", "k");

export interface FooterProps {
  /** Root search: the round menu button in the left pill. */
  menuButton?: { onClick: () => void; open: boolean };
  /** Pushed views: the command's title and icon in the left pill. */
  navigationTitle?: string;
  navigationIcon?: ImageLike;
  /** Extra left-pill content (replaces the navigation title). */
  left?: ReactNode;
  center?: ReactNode;
  actions: ActionPanelModel | null;
  /** Footer label for the primary action when it should differ from the panel title. */
  primaryActionTitle?: string;
  /** Keycaps shown next to the primary action (forms use ⌘↵). */
  primaryShortcut?: "enter" | "cmd-enter";
  actionsOpen: boolean;
  onOpenActions: () => void;
  onRunAction: (action: ActionModel) => void;
}

/**
 * Floating glass pills over the bottom of the window (§3.4): left = menu
 * button, navigation title or toast; right = `[Primary ↵] [Actions ⌘K]`.
 */
export const Footer = memo(function Footer({ menuButton, navigationTitle, navigationIcon, left, center, actions, primaryActionTitle, primaryShortcut = "enter", actionsOpen, onOpenActions, onRunAction }: FooterProps) {
  const toast = useToastStore((state) => state.toast);
  const { primary } = primaryActions(actions);
  const hasMore = flattenActions(actions).length > 1;

  let leftPill: ReactNode = null;
  if (toast) {
    leftPill = <FooterToast key={toast.id} toast={toast} />;
  } else if (left || navigationTitle) {
    leftPill = (
      <div className="sc-footer__pill sc-glass-control" data-animated>
        {left ?? (
          <ActionButton
            variant="secondary"
            outset
            tabIndex={-1}
            leading={navigationIcon !== undefined ? <Image source={navigationIcon} size={18} className="sc-action-button__icon" /> : undefined}
            title={navigationTitle}
            className="sc-footer__nav-title"
          />
        )}
      </div>
    );
  } else if (menuButton) {
    leftPill = (
      <div className="sc-footer__pill sc-glass-control" data-animated>
        <ActionButton
          variant="secondary"
          outset
          aria-label="Surgecast menu"
          aria-haspopup="menu"
          data-state={menuButton.open ? "open" : undefined}
          leading={<MenuGlyph size={18} className="sc-footer__menu-glyph" />}
          onClick={menuButton.onClick}
        />
      </div>
    );
  }

  return (
    <footer className="sc-footer">
      <div className="sc-footer__left">{leftPill}</div>
      {center && <div className="sc-footer__center">{center}</div>}
      {primary && (
        <div className="sc-footer__pill sc-footer__right sc-glass-control" data-open={actionsOpen || undefined}>
          <ActionButton
            variant={primary.style === "destructive" ? "destructive" : "primary"}
            title={primaryActionTitle ?? primary.title}
            shortcut={primaryShortcut === "cmd-enter" ? CMD_ENTER : ENTER}
            outset={!hasMore}
            onClick={() => onRunAction(primary)}
          />
          {hasMore && <ActionButton variant="secondary" title="Actions" shortcut={CMD_K} aria-haspopup="menu" aria-expanded={actionsOpen} data-state={actionsOpen ? "open" : undefined} onClick={onOpenActions} />}
        </div>
      )}
    </footer>
  );
});
