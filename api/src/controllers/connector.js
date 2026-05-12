const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");

const { buildCrud } = require("./_factory");
const Connector = require("../models/connector");
const { JWT_SECRET, APP_URL } = require("../config");
const { getDriver, listTools } = require("../connectors");
const gmail = require("../connectors/gmail");

const router = express.Router();
const auth = passport.authenticate(["user", "admin"], { session: false });

router.get("/oauth/google/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${APP_URL}/connectors?error=${encodeURIComponent(error)}`);
    if (!code || !state) return res.status(400).send("missing code/state");

    let payload;
    try {
      payload = jwt.verify(state, JWT_SECRET);
    } catch {
      return res.status(400).send("invalid state");
    }

    const connector = await Connector.findById(payload.connector_id);
    if (!connector) return res.status(404).send("connector not found");
    if (connector.kind !== "gmail" && connector.kind !== "google_calendar") return res.status(400).send("unsupported kind");

    const tok = await gmail.exchangeCode(code);
    const email = await gmail.fetchUserEmail(tok.access_token);
    gmail.persistTokens(connector, tok, email);
    connector.status = "connected";
    connector.markModified("config");
    await connector.save();

    return res.redirect(`${APP_URL}/connectors?connected=${connector._id}`);
  } catch (err) {
    console.error("oauth callback error", err);
    return res.redirect(`${APP_URL}/connectors?error=${encodeURIComponent(err.message)}`);
  }
});

router.get("/:id/oauth/start", auth, async (req, res) => {
  try {
    const connector = await Connector.findById(req.params.id);
    if (!connector) return res.status(404).send({ ok: false, code: "NOT_FOUND" });
    if (!["gmail", "google_calendar"].includes(connector.kind)) return res.status(400).send({ ok: false, code: "UNSUPPORTED_KIND" });

    const state = jwt.sign({ connector_id: connector._id.toString(), user_id: req.user._id.toString() }, JWT_SECRET, { expiresIn: "10m" });
    const url = gmail.buildAuthUrl(state);
    return res.status(200).send({ ok: true, url });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: "SERVER_ERROR", message: err.message });
  }
});

router.post("/:id/test", auth, async (req, res) => {
  try {
    const connector = await Connector.findById(req.params.id);
    if (!connector) return res.status(404).send({ ok: false, code: "NOT_FOUND" });
    const driver = getDriver(connector.kind);
    if (!driver || !driver.test) return res.status(400).send({ ok: false, code: "NO_DRIVER" });

    try {
      const data = await driver.test(connector);
      connector.status = "connected";
      await connector.save();
      return res.status(200).send({ ok: true, data });
    } catch (e) {
      connector.status = "error";
      await connector.save();
      return res.status(200).send({ ok: false, code: "TEST_FAILED", message: e.message });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: "SERVER_ERROR" });
  }
});

router.post("/:id/run-tool", auth, async (req, res) => {
  try {
    const { tool, args } = req.body || {};
    if (!tool) return res.status(400).send({ ok: false, code: "MISSING_TOOL" });

    const connector = await Connector.findById(req.params.id);
    if (!connector) return res.status(404).send({ ok: false, code: "NOT_FOUND" });

    const driver = getDriver(connector.kind);
    if (!driver) return res.status(400).send({ ok: false, code: "NO_DRIVER" });

    const def = (driver.tools || []).find((t) => t.name === tool);
    if (!def) return res.status(404).send({ ok: false, code: "TOOL_NOT_FOUND" });

    const data = await def.handler(connector, args || {});
    return res.status(200).send({ ok: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: "SERVER_ERROR", message: err.message });
  }
});

router.get("/:id/tools", auth, async (req, res) => {
  try {
    const connector = await Connector.findById(req.params.id);
    if (!connector) return res.status(404).send({ ok: false, code: "NOT_FOUND" });
    return res.status(200).send({ ok: true, data: listTools(connector.kind) });
  } catch (err) {
    return res.status(500).send({ ok: false, code: "SERVER_ERROR" });
  }
});

router.use(
  buildCrud(Connector, {
    searchFields: ["name", "kind"],
    filterFields: ["organization_id", "status", "kind"],
  }),
);

module.exports = router;
