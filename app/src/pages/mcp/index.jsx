import PlaceholderList from "@/components/placeholder-list";

export default function Mcp() {
  return (
    <PlaceholderList
      title="MCP servers"
      resource="/mcp-server"
      fields={[
        { key: "name", label: "Name", required: true },
        { key: "url", label: "URL", required: true },
        { key: "transport", label: "Transport (http/sse/stdio)" },
      ]}
      columns={[
        { key: "name", label: "Name" },
        { key: "url", label: "URL" },
        { key: "transport", label: "Transport" },
        { key: "status", label: "Status" },
      ]}
    />
  );
}
