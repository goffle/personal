const { z } = require("zod");
const File = require("../../models/file");
const { registerCrudTools } = require("./_crud");
const { sanitizeSearch, formatResult, formatError, resolveCaller, withEntityUrl } = require("./_shared");

// Files are workspace-tree nodes: parent_id points at a parent folder File, or
// null for root. Files owned by a Skill live in the same tree, under the folder
// pointed to by Skill.folder_id — they're not distinguished at the File level.

const SNIPPET_WINDOW = 300;

function buildSnippet(text, searchTerm, windowSize = SNIPPET_WINDOW) {
  if (!text) return "";
  if (!searchTerm) return text.length > windowSize ? text.slice(0, windowSize) + "…" : text;
  const re = new RegExp(sanitizeSearch(searchTerm), "i");
  const m = text.match(re);
  if (!m) return text.length > windowSize ? text.slice(0, windowSize) + "…" : text;
  const half = Math.floor((windowSize - m[0].length) / 2);
  const start = Math.max(0, m.index - half);
  const end = Math.min(text.length, m.index + m[0].length + half);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

function registerFileTools(server) {
  registerCrudTools(server, {
    name: "file",
    namePlural: "files",
    Model: File,
    searchFields: ["name", "content_md"],
    skipSearch: true,
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

  server.tool(
    "search_files",
    "Search files in the caller's workspace. By default, content_md is omitted and replaced with `snippet` — ~300 chars centered on the regex match (falls back to the file's opening when the match is in `name`). Pass `select: ['content_md']` to include the full markdown body. Filters: search (regex on name + content_md, case-insensitive), parent_id, kind.",
    {
      search: z.string().optional().describe("Regex (substring) match on name and content_md, case-insensitive."),
      parent_id: z.string().optional(),
      kind: z.enum(["file", "folder"]).optional(),
      select: z.array(z.enum(["content_md"])).optional().describe("Opt-in heavy fields. Without this, content_md is omitted and replaced with a snippet."),
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
          query.$or = [{ name: re }, { content_md: re }];
        }
        if (params.parent_id !== undefined && params.parent_id !== "") query.parent_id = params.parent_id;
        if (params.kind) query.kind = params.kind;

        const wantsFullContent = (params.select || []).includes("content_md");

        const [total, items] = await Promise.all([
          File.countDocuments(query),
          File.find(query)
            .sort(params.sort || "-created_at")
            .skip(params.offset || 0)
            .limit(params.limit || 50)
            .lean(),
        ]);

        const files = items.map((f) => {
          const out = withEntityUrl("file", {
            _id: f._id,
            name: f.name,
            kind: f.kind,
            parent_id: f.parent_id,
            organization_id: f.organization_id,
            created_by: f.created_by,
            created_at: f.created_at,
            updated_at: f.updated_at,
            snippet: buildSnippet(f.content_md, params.search),
          });
          if (wantsFullContent) out.content_md = f.content_md;
          return out;
        });

        return formatResult({ total, count: files.length, files });
      } catch (err) {
        return formatError(err.message);
      }
    },
  );
}

module.exports = { registerFileTools };
