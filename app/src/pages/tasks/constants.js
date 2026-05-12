export const STATUSES = [
  { value: "todo", label: "To do", chip: "bg-slate-100 text-slate-700" },
  { value: "doing", label: "Doing", chip: "bg-amber-100 text-amber-800" },
  { value: "waiting", label: "Waiting", chip: "bg-violet-100 text-violet-800" },
  { value: "done", label: "Done", chip: "bg-emerald-100 text-emerald-800" },
];

export const ENTITIES = [
  { value: "walego", label: "Walego" },
  { value: "selego", label: "Selego" },
  { value: "jobego", label: "Jobego" },
  { value: "tirana", label: "Tirana" },
  { value: "tochet", label: "Tochet" },
  { value: "admin", label: "Admin" },
  { value: "other", label: "Other" },
];

export const statusMeta = (value) => STATUSES.find((s) => s.value === value) || STATUSES[0];
export const entityLabel = (value) => ENTITIES.find((e) => e.value === value)?.label || "";
