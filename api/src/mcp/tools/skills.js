const { z } = require("zod");
const Skill = require("../../models/skill");
const File = require("../../models/file");
const { ensureSkillsRoot } = require("../../services/skill-folders");
const { sanitizeSearch, formatResult, formatError, resolveCaller } = require("./_shared");

// A skill's files live as regular File docs under skill.folder_id (sub-folders
// allowed, real File docs of kind:"folder"). We rebuild a flat {path, body_md}
// list for callers so they don't have to walk the tree.

const ENTRYPOINT = "SKILL.md";

async function listDescendants(rootId) {
  const acc = [];
  const frontier = [rootId];
  while (frontier.length) {
    const next = [];
    const kids = await File.find({ parent_id: { $in: frontier } }).lean();
    for (const k of kids) {
      acc.push(k);
      if (k.kind === "folder") next.push(k._id.toString());
    }
    frontier.length = 0;
    frontier.push(...next);
  }
  return acc;
}

function buildPaths(rootId, descendants) {
  const byId = new Map(descendants.map((d) => [d._id.toString(), d]));
  function pathOf(node) {
    const segments = [node.name];
    let cur = node;
    while (cur.parent_id && cur.parent_id !== rootId) {
      cur = byId.get(cur.parent_id);
      if (!cur) break;
      segments.unshift(cur.name);
    }
    return segments.join("/");
  }
  return descendants
    .filter((d) => d.kind === "file")
    .map((f) => ({ _id: f._id, path: pathOf(f), body_md: f.content_md || "" }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function hydrateFiles(skill) {
  if (!skill?.folder_id) return [];
  const descendants = await listDescendants(skill.folder_id);
  return buildPaths(skill.folder_id, descendants);
}

// Find skill _ids whose tree contains a file matching `regex`. Done by mapping
// each matching File up its parent chain to a root folder; if that root folder
// is a known skill.folder_id, that skill matches.
async function skillIdsMatchingContent({ organizationId, regex }) {
  const skills = await Skill.find({ organization_id: organizationId }, { _id: 1, folder_id: 1 }).lean();
  const folderToSkill = new Map();
  for (const s of skills) {
    if (s.folder_id) folderToSkill.set(s.folder_id, s._id.toString());
  }
  if (folderToSkill.size === 0) return [];

  const matches = await File.find(
    { organization_id: organizationId, kind: "file", content_md: { $regex: regex, $options: "i" } },
    { _id: 1, parent_id: 1 },
  ).lean();
  if (!matches.length) return [];

  // Walk each match up to its top-most ancestor. Use a memoized lookup.
  const parentCache = new Map();
  async function getParent(id) {
    if (parentCache.has(id)) return parentCache.get(id);
    const node = await File.findById(id, { parent_id: 1 }).lean();
    const p = node?.parent_id || null;
    parentCache.set(id, p);
    return p;
  }
  const hitSkills = new Set();
  for (const m of matches) {
    let cur = m.parent_id;
    while (cur) {
      if (folderToSkill.has(cur)) {
        hitSkills.add(folderToSkill.get(cur));
        break;
      }
      cur = await getParent(cur);
    }
  }
  return Array.from(hitSkills);
}

function registerSkillTools(server) {
  server.tool(
    "search_skills",
    "Search skills in the caller's workspace. Use content_search to match against file contents (full-text on skill files), or include_files to see each skill's file tree without re-fetching.",
    {
      search: z.string().optional().describe("Text search on name, description"),
      content_search: z.string().optional().describe("Regex match on the body of any file belonging to a skill (e.g. find which skill mentions a specific tool name)"),
      agent_id: z.string().optional(),
      category: z.string().optional(),
      include_files: z.boolean().optional().describe("If true, populate each skill's files: [{path, body_md}] in the response"),
      limit: z.number().min(1).max(200).default(50).optional(),
      offset: z.number().min(0).default(0).optional(),
      sort: z.string().default("-created_at").optional(),
    },
    async (params, extra) => {
      try {
        const { organizationId } = await resolveCaller(extra);
        const query = { organization_id: organizationId };
        if (params.search) {
          const re = { $regex: sanitizeSearch(params.search), $options: "i" };
          query.$or = [{ name: re }, { description: re }];
        }
        if (params.agent_id) query.agent_id = params.agent_id;
        if (params.category) query.category = params.category;

        if (params.content_search) {
          const ids = await skillIdsMatchingContent({
            organizationId,
            regex: sanitizeSearch(params.content_search),
          });
          if (!ids.length) return formatResult({ total: 0, count: 0, skills: [] });
          query._id = { $in: ids };
        }

        const [total, items] = await Promise.all([
          Skill.countDocuments(query),
          Skill.find(query)
            .sort(params.sort || "-created_at")
            .skip(params.offset || 0)
            .limit(params.limit || 50)
            .lean(),
        ]);

        const skills = await Promise.all(
          items.map(async (s) => {
            const out = { ...s };
            if (params.include_files) out.files = await hydrateFiles(s);
            return out;
          }),
        );
        return formatResult({ total, count: skills.length, skills });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "get_skill",
    "Get a skill by ID. Returns the skill plus its files: [{_id, path, body_md}] (hydrated from the File tree under skill.folder_id). SKILL.md is the entrypoint.",
    { id: z.string() },
    async (params, extra) => {
      try {
        await resolveCaller(extra);
        const skill = await Skill.findById(params.id).lean();
        if (!skill) return formatError("skill not found");
        skill.files = await hydrateFiles(skill);
        return formatResult({ skill });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "create_skill",
    "Create a skill in the caller's workspace. Always seeds a SKILL.md file (entrypoint). Pass body_md to seed it with content, otherwise it starts empty.",
    {
      name: z.string(),
      description: z.string().optional(),
      body_md: z.string().optional().describe("Initial content for SKILL.md (the entrypoint). Add more files via create_file with parent_id=<skill.folder_id>."),
      category: z.string().optional(),
      agent_id: z.string().optional().describe("ID of the agent this skill belongs to"),
    },
    async (params, extra) => {
      try {
        const { user, organizationId } = await resolveCaller(extra);
        const { body_md, ...skillFields } = params;
        const skillsRootId = await ensureSkillsRoot({
          organization_id: organizationId,
          created_by: user._id.toString(),
        });
        const folder = await File.create({
          name: skillFields.name,
          kind: "folder",
          parent_id: skillsRootId,
          organization_id: organizationId,
          created_by: user._id.toString(),
        });
        const skill = await Skill.create({
          ...skillFields,
          folder_id: folder._id.toString(),
          organization_id: organizationId,
          created_by: user._id.toString(),
        });
        await File.create({
          name: ENTRYPOINT,
          kind: "file",
          parent_id: folder._id.toString(),
          content_md: body_md || "",
          organization_id: organizationId,
          created_by: user._id.toString(),
        });
        const obj = skill.toObject();
        obj.files = await hydrateFiles(skill);
        return formatResult({ created: true, skill: obj });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "delete_skill",
    "Delete a skill and its entire folder tree (SKILL.md + every file/sub-folder under skill.folder_id).",
    { id: z.string() },
    async (params, extra) => {
      try {
        await resolveCaller(extra);
        const skill = await Skill.findByIdAndDelete(params.id).lean();
        if (!skill) return formatError("skill not found");
        if (skill.folder_id) {
          const descendants = await listDescendants(skill.folder_id);
          const ids = descendants.map((d) => d._id.toString());
          ids.push(skill.folder_id);
          await File.deleteMany({ _id: { $in: ids } });
        }
        return formatResult({ deleted: true, id: params.id });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "update_skill",
    "Update fields of a skill. To edit a skill's files (including SKILL.md), use create_file/update_file/delete_file under parent_id=<skill.folder_id>.",
    {
      id: z.string(),
      fields: z
        .object({
          name: z.string().optional(),
          description: z.string().optional(),
          category: z.string().optional(),
          agent_id: z.string().optional(),
        })
        .describe("Fields to update (snake_case)"),
    },
    async (params, extra) => {
      try {
        await resolveCaller(extra);
        const skill = await Skill.findByIdAndUpdate(params.id, { $set: params.fields }, { new: true }).lean();
        if (!skill) return formatError("skill not found");
        if (params.fields?.name && skill.folder_id) {
          await File.findByIdAndUpdate(skill.folder_id, { name: params.fields.name });
        }
        skill.files = await hydrateFiles(skill);
        return formatResult({ updated: true, skill });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );
}

module.exports = { registerSkillTools };
