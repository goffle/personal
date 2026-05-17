const { z } = require("zod");
const Connector = require("../../models/connector");
const { DRIVERS } = require("../../connectors");
const { formatResult, formatError, resolveCaller } = require("./_shared");

/**
 * Convert a tool's JSON Schema (a small, predictable subset used by drivers)
 * into the zod-object-literal shape that McpServer.tool() expects as its
 * `paramsSchema` argument. We keep this intentionally narrow — drivers only
 * use object schemas with primitive/array properties and optional `enum` /
 * `default` annotations.
 */
function jsonSchemaToZodShape(schema) {
  const shape = {};
  const props = schema?.properties || {};
  const required = new Set(schema?.required || []);
  for (const [key, prop] of Object.entries(props)) {
    let s = primitiveToZod(prop);
    if (prop.description) s = s.describe(prop.description);
    if (!required.has(key)) s = s.optional();
    if (prop.default !== undefined) s = s.default(prop.default);
    shape[key] = s;
  }
  return shape;
}

function primitiveToZod(prop) {
  if (Array.isArray(prop.enum) && prop.enum.length) {
    return z.enum(prop.enum);
  }
  switch (prop.type) {
    case "string":
      return z.string();
    case "integer":
      return z.number().int();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(prop.items?.type === "string" ? z.string() : z.any());
    case "object":
      return z.object(jsonSchemaToZodShape(prop));
    default:
      return z.any();
  }
}

/**
 * Resolve which connector to use for a given (kind, org). Disambiguation
 * order: explicit connector_id → account_email match → unique connected
 * connector of that kind. Throws a clear, recoverable error otherwise.
 */
async function resolveConnector({ organization_id, kind, connector_id, account_email }) {
  if (connector_id) {
    const conn = await Connector.findOne({ _id: connector_id, organization_id });
    if (!conn) throw new Error(`connector ${connector_id} not found in this workspace`);
    if (conn.kind !== kind) throw new Error(`connector ${connector_id} is kind="${conn.kind}", not "${kind}"`);
    return conn;
  }
  const query = { organization_id, kind };
  const all = await Connector.find(query);
  const connected = all.filter((c) => c.status === "connected");
  if (account_email) {
    const match = connected.find((c) => c.config?.account_email === account_email);
    if (!match) {
      const known = connected.map((c) => c.config?.account_email).filter(Boolean);
      throw new Error(`no connected ${kind} connector for account_email="${account_email}". Known accounts: ${known.join(", ") || "(none)"}`);
    }
    return match;
  }
  if (connected.length === 0) {
    if (all.length === 0) throw new Error(`no ${kind} connector exists in this workspace — connect one first`);
    throw new Error(`${kind} connector(s) exist but none are status="connected"`);
  }
  if (connected.length > 1) {
    const accounts = connected.map((c) => c.config?.account_email || c._id.toString());
    throw new Error(`multiple connected ${kind} connectors — pass account_email or connector_id. Available: ${accounts.join(", ")}`);
  }
  return connected[0];
}

/**
 * Drivers whose tools require a per-org connector (Gmail, Calendar, …). The
 * stateless `web` driver isn't exposed here — web search/fetch through Jeeve
 * would be redundant when the calling MCP client already has its own web
 * tools, and skipping it avoids picking an arbitrary connector row.
 */
const EXPOSED_KINDS = {
  gmail: "gmail",
  google_calendar: "calendar",
};

function registerConnectorActionTools(server) {
  for (const [kind, prefix] of Object.entries(EXPOSED_KINDS)) {
    const driver = DRIVERS[kind];
    if (!driver?.tools?.length) continue;
    for (const tool of driver.tools) {
      const suffix = tool.name.includes(".") ? tool.name.split(".").slice(1).join("_") : tool.name;
      const mcpName = `${prefix}_${suffix}`;
      const shape = jsonSchemaToZodShape(tool.schema || { type: "object", properties: {} });
      shape.account_email = z
        .string()
        .optional()
        .describe(`Optional ${kind} account email when multiple ${kind} connectors are linked to this workspace. Omit if only one is connected.`);
      shape.connector_id = z.string().optional().describe("Explicit connector id (overrides account_email).");
      server.tool(mcpName, tool.description, shape, async (params, extra) => {
        try {
          const { organizationId } = await resolveCaller(extra);
          const connector = await resolveConnector({
            organization_id: organizationId,
            kind,
            connector_id: params.connector_id,
            account_email: params.account_email,
          });
          const { account_email, connector_id, ...rest } = params;
          const result = await tool.handler(connector, rest);
          return formatResult({
            connector_id: connector._id.toString(),
            account_email: connector.config?.account_email || null,
            ...result,
          });
        } catch (err) {
          return formatError(err.message);
        }
      });
    }
  }
}

module.exports = { registerConnectorActionTools };
