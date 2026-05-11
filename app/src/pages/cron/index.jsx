import PlaceholderList from "@/components/placeholder-list";

export default function Cron() {
  return (
    <PlaceholderList
      title="Cron"
      resource="/cron-job"
      fields={[
        { key: "name", label: "Name", required: true },
        { key: "schedule", label: "Schedule (cron expr)", required: true },
        { key: "skill_name", label: "Skill name" },
      ]}
      columns={[
        { key: "name", label: "Name" },
        { key: "schedule", label: "Schedule" },
        { key: "skill_name", label: "Skill" },
        { key: "last_run_at", label: "Last run", render: (it) => (it.last_run_at ? new Date(it.last_run_at).toLocaleString() : "—") },
      ]}
    />
  );
}
