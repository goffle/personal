// ISO 8601 week helpers (Monday → Sunday). Mirrors api/src/mcp/tools/workspace.js.

function isoWeekParts(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

export function isoWeekName(date) {
  const { year, week } = isoWeekParts(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function shiftWeek(date, offset) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + offset * 7);
  return d;
}

export function currentSprint() {
  return isoWeekName(new Date());
}

// Returns sprint name options for selects:
// Backlog → past N → current → next M.
export function sprintOptions({ pastWeeks = 4, futureWeeks = 1 } = {}) {
  const now = new Date();
  const weeks = [];
  for (let i = -pastWeeks; i <= futureWeeks; i++) {
    weeks.push(isoWeekName(shiftWeek(now, i)));
  }
  return ["Backlog", ...weeks];
}

export function sprintLabel(name) {
  if (!name) return "—";
  if (name === "Backlog") return "Backlog";
  if (name === currentSprint()) return `${name} (current)`;
  return name;
}
