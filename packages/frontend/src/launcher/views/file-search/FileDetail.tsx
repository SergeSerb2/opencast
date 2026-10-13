import { useEffect, useState } from "react";
import type { FileResult, NativeResult } from "@surgecast/protocol";
import { native } from "../../../bridge/native";
import { ItemDetail, Metadata } from "../../../components";
import { Image } from "../../../icons/Image";
import { localFileUrl } from "../../../icons/image-source";
import { displayDirectory, formatBytes, formatTimestamp } from "../library/format";
import { fileTypeName, isFolder, isImageFile, isTextFile } from "./file-types";

const TEXT_PREVIEW_LIMIT = 500_000;
const TEXT_PREVIEW_LINES = 60;

type FileMetadata = NativeResult<"files.metadata">;

/** First lines of a small text file, read through the host's file scheme. */
function useTextPreview(file: FileResult): string | null {
  const [text, setText] = useState<string | null>(null);
  const readable = isTextFile(file) && (file.size ?? 0) <= TEXT_PREVIEW_LIMIT;
  useEffect(() => {
    setText(null);
    if (!readable) return;
    const controller = new AbortController();
    fetch(localFileUrl(file.path), { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : null))
      .then((content) => {
        if (!controller.signal.aborted) setText(content === null ? null : content.split(/\r?\n/).slice(0, TEXT_PREVIEW_LINES).join("\n"));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [file.path, readable]);
  return text;
}

function useFileMetadata(path: string): FileMetadata | null {
  const [metadata, setMetadata] = useState<FileMetadata | null>(null);
  useEffect(() => {
    let live = true;
    setMetadata(null);
    native
      .call("files.metadata", { path })
      .then((result) => live && setMetadata(result))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [path]);
  return metadata;
}

const parseDate = (value?: string) => (value ? Date.parse(value) : NaN);

/** Preview (image, text excerpt or icon) and "Metadata" rows for a file search result. */
export function FileDetail({ file }: { file: FileResult }) {
  const metadata = useFileMetadata(file.path);
  const text = useTextPreview(file);
  const [dimensions, setDimensions] = useState<string | null>(null);
  useEffect(() => setDimensions(null), [file.path]);

  const created = parseDate(metadata?.created);
  const metadataModified = parseDate(metadata?.modified);
  const modified = Number.isFinite(metadataModified) ? metadataModified : file.modified;
  const accessed = parseDate(metadata?.lastOpened);
  const size = metadata?.size ?? file.size;

  const preview = isImageFile(file) ? (
    <div className="sc-file-preview sc-file-preview--image">
      <img src={localFileUrl(file.path)} alt="" draggable={false} onLoad={(e) => setDimensions(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)} />
    </div>
  ) : text !== null ? (
    <pre className="sc-file-preview sc-file-preview--text">{text}</pre>
  ) : (
    <div className="sc-file-preview sc-file-preview--icon">
      <Image source={{ fileIcon: file.path }} size={112} />
    </div>
  );

  return (
    <ItemDetail
      preview={preview}
      metadataTitle="Metadata"
      metadata={
        <Metadata>
          <Metadata.Label title="Name" text={file.name} />
          <Metadata.Label title="Where" text={displayDirectory(file.path)} />
          <Metadata.Label title="Type" text={fileTypeName(file)} />
          {dimensions && <Metadata.Label title="Dimensions" text={dimensions} />}
          {!isFolder(file) && size !== undefined && size > 0 && <Metadata.Label title="Size" text={formatBytes(size)} />}
          {Number.isFinite(created) && <Metadata.Label title="Created" text={formatTimestamp(created)} />}
          {modified !== undefined && Number.isFinite(modified) && <Metadata.Label title="Modified" text={formatTimestamp(modified)} />}
          {Number.isFinite(accessed) && <Metadata.Label title="Accessed" text={formatTimestamp(accessed)} />}
        </Metadata>
      }
    />
  );
}
