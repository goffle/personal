const mongoose = require("mongoose");
const { encrypt } = require("../utils/crypto");

const SENSITIVE_KEYS = ["refresh_token", "access_token", "client_secret", "api_key"];
const AUTO_ENCRYPT_KEYS = ["api_key"];

const ConnectorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    kind: { type: String, default: "generic" },
    status: { type: String, enum: ["connected", "disconnected", "error"], default: "disconnected" },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    organization_id: { type: String, index: true },
    created_by: { type: String },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

function encryptConfigInPlace(cfg) {
  if (!cfg || typeof cfg !== "object") return false;
  let changed = false;
  for (const k of AUTO_ENCRYPT_KEYS) {
    const v = cfg[k];
    if (typeof v === "string" && v.length > 0 && !v.startsWith("v1:")) {
      cfg[k] = encrypt(v);
      changed = true;
    }
  }
  return changed;
}

ConnectorSchema.pre("save", function (next) {
  if (encryptConfigInPlace(this.config)) this.markModified("config");
  next();
});

ConnectorSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  if (update.config) encryptConfigInPlace(update.config);
  if (update.$set?.config) encryptConfigInPlace(update.$set.config);
  next();
});

ConnectorSchema.set("toJSON", {
  transform: (_doc, ret) => {
    if (ret.config && typeof ret.config === "object") {
      const safe = {};
      for (const [k, v] of Object.entries(ret.config)) {
        safe[k] = SENSITIVE_KEYS.includes(k) ? (v ? "***" : v) : v;
      }
      ret.config = safe;
    }
    return ret;
  },
});

module.exports = mongoose.model("Connector", ConnectorSchema);
