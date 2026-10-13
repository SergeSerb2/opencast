import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { ImageLike } from "@opencast/protocol";
import type { ActionsProp } from "../actions/ActionPanel";
import { Markdown } from "../Markdown/Markdown";
import { ScrollArea } from "../ScrollArea/ScrollArea";
import { useRegisterActions } from "../View/useRegisterActions";
import { ViewFrame } from "../View/ViewFrame";
import { MetadataView, type MetadataEntry } from "./Metadata";
import { Spinner } from "../Spinner/Spinner";
import "./detail.css";

/** A metadata element (`<Metadata>…</Metadata>`) or prebuilt entries. */
export type MetadataProp = ReactElement | MetadataEntry[] | null | undefined;

function renderMetadata(metadata: MetadataProp, layout: "wide" | "narrow", title?: string): ReactNode {
  if (!metadata) return null;
  if (Array.isArray(metadata)) return metadata.length ? <MetadataView entries={metadata} layout={layout} title={title} /> : null;
  if (isValidElement(metadata)) return <MetadataView layout={layout} title={title}>{(metadata.props as { children?: ReactNode }).children}</MetadataView>;
  return null;
}

export interface ItemDetailProps {
  markdown?: string | null;
  metadata?: MetadataProp;
  isLoading?: boolean;
  /** Custom preview instead of markdown (e.g. clipboard image). */
  preview?: ReactNode;
  metadataTitle?: string;
}

/**
 * Right pane of a list with `isShowingDetail` (`List.Item.Detail`): preview
 * on top (280px tall when followed by metadata), metadata rows below.
 */
export function ItemDetail({ markdown, metadata, isLoading, preview, metadataTitle = "Information" }: ItemDetailProps) {
  const meta = renderMetadata(metadata, "wide", metadataTitle);
  const content = preview ?? (markdown ? <Markdown>{markdown}</Markdown> : null);
  return (
    <div className="sc-item-detail">
      {(content || isLoading) && (
        <div className="sc-item-detail__preview" data-with-metadata={meta ? "" : undefined}>
          <ScrollArea fade={{ top: meta ? 0 : 96, bottom: meta ? 24 : 72 }} thumbInset={{ top: 64 }}>
            <div className="sc-item-detail__preview-inner">{isLoading && !content ? <Spinner /> : content}</div>
          </ScrollArea>
        </div>
      )}
      {meta && (
        <div className="sc-item-detail__metadata">
          <ScrollArea fade={{ top: 32, bottom: 72 }} thumbInset={{ bottom: 52 }}>
            <div className="sc-item-detail__metadata-inner">{meta}</div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

export interface DetailProps {
  markdown?: string | null;
  metadata?: MetadataProp;
  actions?: ActionsProp;
  navigationTitle?: string;
  navigationIcon?: ImageLike;
  isLoading?: boolean;
  /** Custom body instead of markdown. */
  children?: ReactNode;
}

/** Full-view Detail: markdown body, optional 263px metadata sidebar (narrow layout). */
export function Detail({ markdown, metadata, actions, navigationTitle, navigationIcon, isLoading, children }: DetailProps) {
  return (
    <ViewFrame navigationTitle={navigationTitle} navigationIcon={navigationIcon} isLoading={isLoading}>
      <DetailBody markdown={markdown} metadata={metadata} actions={actions}>
        {children}
      </DetailBody>
    </ViewFrame>
  );
}

function DetailBody({ markdown, metadata, actions, children }: Pick<DetailProps, "markdown" | "metadata" | "actions" | "children">) {
  useRegisterActions(actions);
  const meta = renderMetadata(metadata, "narrow");
  return (
    <div className="sc-detail" data-with-metadata={meta ? "" : undefined}>
      <div className="sc-detail__body">
        <ScrollArea fade={{ top: 96, bottom: 72 }} thumbInset={{ top: 64, bottom: 52 }}>
          <div className="sc-detail__inner">{children ?? (markdown ? <Markdown>{markdown}</Markdown> : null)}</div>
        </ScrollArea>
      </div>
      {meta && (
        <aside className="sc-detail__metadata">
          <ScrollArea fade={{ top: 96, bottom: 72 }} thumbInset={{ top: 64, bottom: 52 }}>
            <div className="sc-detail__metadata-inner">{meta}</div>
          </ScrollArea>
        </aside>
      )}
    </div>
  );
}
