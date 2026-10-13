import { useState } from "react";
import { useBackend } from "../bridge/hooks";
import { List } from "../components";

/** Launcher window: root search. */
export function LauncherApp() {
  const [query, setQuery] = useState("");
  const { data, isLoading } = useBackend("search.root", { query });
  return (
    <div className="sc-launcher-scope" style={{ position: "absolute", inset: 0 }}>
      <List searchText={query} onSearchTextChange={setQuery} filtering={false} isLoading={isLoading} searchBarPlaceholder="Search for apps and commands…">
        {data?.sections.map((section) => (
          <List.Section key={section.id} title={section.title}>
            {section.items.map((item) => (
              <List.Item key={item.id} id={item.id} title={item.title} subtitle={item.subtitle} icon={item.icon} titleRanges={item.matches} accessories={[{ text: item.typeLabel }]} />
            ))}
          </List.Section>
        ))}
      </List>
    </div>
  );
}
