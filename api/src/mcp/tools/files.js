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
      parentId: { type: z.string(), field: "parent_id" },
      kind: { type: z.enum(["file", "folder"]), field: "kind" },
    },
    createShape: {
      name: z.string(),
      kind: z.enum(["file", "folder"]),
      parent_id: z.string().nullable().optional(),
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
