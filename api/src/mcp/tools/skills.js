const { z } = require("zod");
const Skill = require("../../models/skill");
const File = require("../../models/file");
const { sanitizeSearch, formatResult, formatError, resolveCaller } = require("./_shared");

// Files belonging to skills are stored as top-level File docs with
// parent_kind='skill'. Hydrate them back into the {path, body_md} shape
// so MCP callers see one consistent view.

function fileToSkillFile(f) {
  return { _id: f._id, path: f.name, body_md: f.content_md || "" };
}

async function hydrateFiles(skillId) {
  const files = await File.find({ parent_kind: "skill", parent_id: skillId.toString() }).sort({ name: 1 }).lean();
  return files.map(fileToSkillFile);
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
      omit_body: z.boolean().optional().describe("If true, omit body_md from each skill in the response (use with include_files to keep payloads small)"),
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
          const re = { $regex: sanitizeSearch(params.content_search), $options: "i" };
          const matchingParents = await File.distinct("parent_id", {
            organization_id: organizationId,
            parent_kind: "skill",
            content_md: re,
          });
          if (!matchingParents.length) return formatResult({ total: 0, count: 0, skills: [] });
          query._id = { $in: matchingParents };
        }

        const [total, items] = await Promise.all([
          Skill.countDocuments(query),
          Skill.find(query)
            .sort(params.sort || "-created_at")
            .skip(params.offset || 0)
            .limit(params.limit || 50)
            .lean(),
        ]);

        let filesByParent = new Map();
        if (params.include_files && items.length) {
          const ids = items.map((s) => s._id.toString());
          const files = await File.find({ parent_kind: "skill", parent_id: { $in: ids } }).sort({ name: 1 }).lean();
          for (const f of files) {
            if (!filesByParent.has(f.parent_id)) filesByParent.set(f.parent_id, []);
            filesByParent.get(f.parent_id).push(fileToSkillFile(f));
          }
        }

        const skills = items.map((s) => {
          const out = { ...s };
          if (params.omit_body) delete out.body_md;
          if (params.include_files) out.files = filesByParent.get(s._id.toString()) || [];
          return out;
        });
        return formatResult({ total, count: skills.length, skills });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "get_skill",
    "Get a skill by ID. Returns the skill plus its files: [{_id, path, body_md}] (hydrated from the File collection).",
    { id: z.string() },
    async (params, extra) => {
      try {
        await resolveCaller(extra);
        const skill = await Skill.findById(params.id).lean();
        if (!skill) return formatError("skill not found");
        skill.files = await hydrateFiles(skill._id);
        return formatResult({ skill });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "create_skill",
    "Create a skill in the caller's workspace.",
    {
      name: z.string(),
      description: z.string().optional(),
      body_md: z.string().optional(),
      category: z.string().optional(),
      agent_id: z.string().optional().describe("ID of the agent this skill belongs to"),
    },
    async (params, extra) => {
      try {
        const { user, organizationId } = await resolveCaller(extra);
        const skill = await Skill.create({ ...params, organization_id: organizationId, created_by: user._id.toString() });
        const obj = skill.toObject();
        obj.files = [];
        return formatResult({ created: true, skill: obj });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );

  server.tool(
    "update_skill",
    "Update fields of a skill. To edit a skill's files, use create_file/update_file/delete_file with parent_kind:'skill', parent_id:<skill_id>.",
    {
      id: z.string(),
      fields: z
        .object({
          name: z.string().optional(),
          description: z.string().optional(),
          body_md: z.string().optional(),
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
        skill.files = await hydrateFiles(skill._id);
        return formatResult({ updated: true, skill });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );
}

module.exports = { registerSkillTools };
