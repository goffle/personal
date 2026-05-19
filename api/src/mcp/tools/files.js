const { z } = require("zod");
const File = require("../../models/file");
const { registerCrudTools } = require("./_crud");

// Files are either workspace-tree nodes (parent_id points at a folder File, or
// null for root) OR skill-owned files (skill_id is the owner skill _id). The
// File.pre('validate') hook enforces that at most one is set; the validators
// below give MCP callers an early, clear error message before mongoose throws.

function registerFileTools(server) {
  registerCrudTools(server, {
    name: "file",
    namePlural: "files",
    Model: File,
    searchFields: ["name", "content_md"],
    extraFilters: {
      parent_id: { type: z.string(), field: "parent_id" },
      skill_id: { type: z.string(), field: "skill_id" },
      kind: { type: z.enum(["file", "folder"]), field: "kind" },
    },
    createShape: {
      name: z.string().describe("File name (or relative path for skill files, e.g. 'reference/example.md')"),
      kind: z.enum(["file", "folder"]),
      parent_id: z.string().nullable().optional().describe("Folder File _id when this lives in the workspace tree. Leave null for root, or when skill_id is set."),
      skill_id: z.string().nullable().optional().describe("Skill _id when this file belongs to a skill. Mutually exclusive with parent_id."),
      content_md: z.string().optional(),
    },
    updateShape: {
      name: z.string().optional(),
      parent_id: z.string().nullable().optional(),
      skill_id: z.string().nullable().optional(),
      content_md: z.string().optional(),
    },
    beforeCreate: async (params) => {
      if (params.parent_id && params.skill_id) {
        throw new Error("parent_id and skill_id are mutually exclusive — pass only one");
      }
      return params;
    },
    beforeUpdate: async ({ id, fields }) => {
      if (fields.parent_id && fields.skill_id) {
        throw new Error("parent_id and skill_id are mutually exclusive — pass only one");
      }
      return { id, fields };
    },
  });
}

module.exports = { registerFileTools };
