const mongoose = require("mongoose");

const OAuthTokenSchema = new mongoose.Schema({
  type: { type: String, required: true, enum: ["authorization_code", "access_token", "refresh_token"], index: true },
  token: { type: String, required: true, unique: true, index: true },
  client_id: { type: String, required: true, index: true },
  user_id: { type: String, required: true, index: true },
  organization_id: { type: String, index: true },

  scopes: { type: [String], default: [] },
  expires_at: { type: Date, required: true },

  code_challenge: { type: String },
  redirect_uri: { type: String },
  state: { type: String },
  resource: { type: String },
  used: { type: Boolean, default: false },

  client_name: { type: String },
  last_used_at: { type: Date },

  created_at: { type: Date, default: Date.now },
});

OAuthTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model("OAuthToken", OAuthTokenSchema);
