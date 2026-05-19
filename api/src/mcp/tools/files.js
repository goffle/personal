const { z } = require("zod");
const File = require("../../models/file");
const { registerCrudTools } = require("./_crud");

// Files are workspace-tree nodes: parent_id points at a parent folder File, or
// null for root. Files owned by a Skill live in the same tree, under the folder
// pointed to by Skill.folder_id — they're not distinguished at the File level.

function registerFileTools(server) {
  registerCrudTools(server, {
    name: "file",
    namePlural: "files",
    Model: File,
    searchFields: ["name", "content_md"],
    extraFilters: {
      parent_id: { type: z.string(), field: "parent_id" },
      kind: { type: z.enum(["file", "folder"]), field: "kind" },
    },
    createShape: {
      name: z.string().describe("File or folder name"),
      kind: z.enum(["file", "folder"]),
      parent_id: z.string().nullable().optional().describe("Folder File _id where this lives. Null = root."),
      content_md: z.string().optional(),
    },
    updateShape: {
      name: z.string().optional(),
      parent_id: z.string().nullable().optional(),
      content_md: z.string().optional(),
    },
  });
}

module.exports = { registerFileTools };
