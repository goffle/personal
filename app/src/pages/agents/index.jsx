import PlaceholderList from "@/components/placeholder-list";

export default function Agents() {
  return (
    <PlaceholderList
      title="Agents"
      resource="/agent"
      fields={[
        { key: "name", label: "Name", required: true },
        { key: "reference", label: "Reference" },
        { key: "sound_url", label: "Sound URL" },
        { key: "system_prompt", label: "System prompt", textarea: true },
      ]}
      columns={[
        { key: "name", label: "Name" },
        { key: "reference", label: "Reference" },
        { key: "model", label: "Model" },
      ]}
    />
  );
}
