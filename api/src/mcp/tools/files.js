const { z } = require("zod");
const File = require("../../models/file");
const { registerCrudTools } = require("./_crud");

function registerFileTools(server) {
  registerCrudTools(server, {
    name: "file",
    namePlural: "files",
    Model: File,
    searchFields: ["name", "content_md"],
    extraFilters: {
      parent_id: { type: z.string(), field: "parent_id" },
      parent_kind: { type: z.string(), field: "parent_kind" },
      kind: { type: z.enum(["file", "folder"]), field: "kind" },
    },
    createShape: {
      name: z.string(),
      kind: z.enum(["file", "folder"]),
      parent_id: z.string().nullable().optional(),
      parent_kind: z.string().nullable().optional().describe("Owner kind when this file lives under a non-file parent (e.g. 'skill'). Leave null for files in the workspace tree."),
      content_md: z.string().optional(),
    },
    updateShape: {
      name: z.string().optional(),
      parent_id: z.string().nullable().optional(),
      parent_kind: z.string().nullable().optional(),
      content_md: z.string().optional(),
    },
  });
}

module.exports = { registerFileTools };
