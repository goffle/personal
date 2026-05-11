import PlaceholderList from "@/components/placeholder-list";

export default function Connectors() {
  return (
    <PlaceholderList
      title="Connectors"
      resource="/connector"
      fields={[
        { key: "name", label: "Name", required: true },
        { key: "kind", label: "Kind (e.g. hubspot, gmail)" },
      ]}
      columns={[
        { key: "name", label: "Name" },
        { key: "kind", label: "Kind" },
        { key: "status", label: "Status" },
      ]}
    />
  );
}
