import PlaceholderList from "@/components/placeholder-list";

export default function Skills() {
  return (
    <PlaceholderList
      title="Skills"
      resource="/skill"
      fields={[
        { key: "name", label: "Name", required: true },
        { key: "description", label: "Description" },
        { key: "body_md", label: "Body (Markdown)", textarea: true },
      ]}
      columns={[
        { key: "name", label: "Name" },
        { key: "description", label: "Description" },
      ]}
    />
  );
}
