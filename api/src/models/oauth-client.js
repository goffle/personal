const mongoose = require("mongoose");

const OAuthClientSchema = new mongoose.Schema({
  client_id: { type: String, required: true, unique: true, index: true },
  client_secret: { type: String },
  client_id_issued_at: { type: Number },
  client_secret_expires_at: { type: Number },

  redirect_uris: { type: [String], required: true },
  token_endpoint_auth_method: { type: String },
  grant_types: { type: [String] },
  response_types: { type: [String] },
  client_name: { type: String },
  client_uri: { type: String },
  logo_uri: { type: String },
  scope: { type: String },
  contacts: { type: [String] },
  tos_uri: { type: String },
  policy_uri: { type: String },
  software_id: { type: String },
  software_version: { type: String },

  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model("OAuthClient", OAuthClientSchema);
