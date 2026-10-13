import { useEffect, useState } from "react";
import { getEnv } from "../../bridge/env";
import { useBackend } from "../../bridge/hooks";
import { native } from "../../bridge/native";
import { Button } from "../../components/Button/Button";
import { openUrl } from "../actions";
import { LINKS } from "../links";
import { Dialog } from "../ui/Dialog";
import { Intro, NavRow, Row, Section } from "../ui/layout";
import { PageFrame } from "../ui/PageFrame";

/** Major open-source components shipped in Surgecast and their licenses. */
const THIRD_PARTY: { name: string; license: string }[] = [
  { name: "React", license: "MIT" },
  { name: "Zustand", license: "MIT" },
  { name: "Tiptap & ProseMirror", license: "MIT" },
  { name: "react-markdown, remark-gfm, rehype-highlight", license: "MIT" },
  { name: "highlight.js", license: "BSD-3-Clause" },
  { name: "Lucide icons", license: "ISC" },
  { name: "Inter typeface", license: "SIL Open Font License 1.1" },
  { name: "JetBrains Mono typeface", license: "SIL Open Font License 1.1" },
  { name: "Model Context Protocol SDK", license: "MIT" },
  { name: "Node.js", license: "MIT" },
  { name: "@raycast/api type definitions", license: "MIT" },
];

function useVersion(): string | null {
  const { data: backendInfo } = useBackend("app.info", undefined);
  const [nativeVersion, setNativeVersion] = useState<string | null>(null);
  useEffect(() => {
    if (!native.available) return;
    native.call("app.info").then(
      (info) => setNativeVersion(`${info.version} (${info.build})`),
      () => undefined,
    );
  }, []);
  return nativeVersion ?? backendInfo?.version ?? (getEnv().appVersion !== "dev" ? getEnv().appVersion : null);
}

function LicensesDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Licenses" onClose={onClose} width={440} footer={<Button onClick={onClose}>Done</Button>}>
      <p className="sc-s-dialog-text">Surgecast is free software under the MIT License. It builds on these open-source projects:</p>
      <ul className="sc-s-results">
        {THIRD_PARTY.map((entry) => (
          <li key={entry.name} className="sc-s-results__item">
            <span className="sc-s-results__title">{entry.name}</span>
            <span className="sc-s-results__detail">{entry.license}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Settings → About. */
export function AboutPage() {
  const version = useVersion();
  const [licenses, setLicenses] = useState(false);
  return (
    <PageFrame title="About">
      <Intro
        icon={{ tile: { glyph: "surgecast-logo", background: ["#FF7A7A", "#E5383B"] } }}
        title="Surgecast"
        description="An open-source launcher for macOS. Your AI keys, your sync server, no paywalls."
      >
        <span className="sc-s-value" data-selectable="true">
          {version ? `Version ${version}` : "Development build"}
        </span>
      </Intro>
      <Section anchor="links">
        <NavRow title="Website" icon="globe-01-16" indicator="external" onClick={() => openUrl(LINKS.website)} />
        <NavRow title="Release Notes" icon="blank-document-16" indicator="external" onClick={() => openUrl(LINKS.releases)} />
        <NavRow title="Report an Issue" icon="bug-16" indicator="external" onClick={() => openUrl(LINKS.issues)} />
      </Section>
      <Section anchor="licenses">
        <Row title="Licenses" description="Surgecast is MIT-licensed open source.">
          <Button size="small" onClick={() => setLicenses(true)}>
            Show Licenses
          </Button>
        </Row>
      </Section>
      <p className="sc-s-disclaimer">Surgecast is an independent project. It is not affiliated with, endorsed by, or sponsored by Raycast Technologies Ltd. “Raycast” is a trademark of its owner.</p>
      {licenses && <LicensesDialog onClose={() => setLicenses(false)} />}
    </PageFrame>
  );
}
