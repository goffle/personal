const express = require("express");
const router = express.Router();
const passport = require("passport");
const jwt = require("jsonwebtoken");

const User = require("../models/user");
const Organization = require("../models/organization");
const config = require("../config");
const { validatePassword, slugify } = require("../utils");

const SERVER_ERROR = "SERVER_ERROR";
const EMAIL_AND_PASSWORD_REQUIRED = "EMAIL_AND_PASSWORD_REQUIRED";
const USER_NOT_EXISTS = "USER_NOT_EXISTS";
const EMAIL_OR_PASSWORD_INVALID = "EMAIL_OR_PASSWORD_INVALID";
const USER_ALREADY_EXISTS = "USER_ALREADY_EXISTS";
const PASSWORD_NOT_VALIDATED = "PASSWORD_NOT_VALIDATED";
const INVALID_BODY = "INVALID_BODY";
const NOT_FOUND = "NOT_FOUND";

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const JWT_MAX_AGE = "30d";

const cookieOptions = () => ({
  maxAge: COOKIE_MAX_AGE,
  httpOnly: true,
  path: "/",
  secure: config.ENVIRONMENT !== "development",
  sameSite: config.ENVIRONMENT === "development" ? "Lax" : "None",
});

router.post("/signup", async (req, res) => {
  try {
    const { password, firstname, lastname, organization_name } = req.body;
    const email = (req.body.email || "").trim().toLowerCase();

    if (!email || !password) return res.status(400).send({ ok: false, code: EMAIL_AND_PASSWORD_REQUIRED });
    if (!firstname || !lastname) return res.status(400).send({ ok: false, code: INVALID_BODY, message: "First name and last name are required" });
    if (!organization_name) return res.status(400).send({ ok: false, code: INVALID_BODY, message: "Organization name is required" });
    if (!validatePassword(password)) return res.status(400).send({ ok: false, code: PASSWORD_NOT_VALIDATED });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).send({ ok: false, code: USER_ALREADY_EXISTS });

    const org = await Organization.create({ name: organization_name, slug: slugify(organization_name) + "-" + Date.now().toString(36) });

    const user = await User.create({
      email,
      password,
      firstname,
      lastname,
      registered_at: new Date(),
      organisations: [{ id: org._id.toString(), name: org.name, role: "owner" }],
    });
    org.created_by = user._id.toString();
    await org.save();

    const token = jwt.sign({ _id: user._id }, config.JWT_SECRET, { expiresIn: JWT_MAX_AGE });
    res.cookie("jwt", token, cookieOptions());
    return res.status(200).send({ ok: true, token, user, organisations: [org] });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) return res.status(409).send({ ok: false, code: USER_ALREADY_EXISTS });
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.post("/signin", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) return res.status(400).send({ ok: false, code: EMAIL_AND_PASSWORD_REQUIRED });

    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(401).send({ ok: false, code: USER_NOT_EXISTS });

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).send({ ok: false, code: EMAIL_OR_PASSWORD_INVALID });

    user.set({ last_login_at: new Date() });
    await user.save();

    const orgIds = (user.organisations || []).map((o) => o.id);
    const organisations = orgIds.length ? await Organization.find({ _id: { $in: orgIds } }).lean() : [];

    const token = jwt.sign({ _id: user._id }, config.JWT_SECRET, { expiresIn: JWT_MAX_AGE });
    res.cookie("jwt", token, cookieOptions());

    return res.status(200).send({ ok: true, token, user: user.toJSON(), organisations });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.get("/signin_token", passport.authenticate("user", { session: false }), async (req, res) => {
  try {
    const user = req.user;
    user.set({ last_login_at: new Date() });
    await user.save();

    const orgIds = (user.organisations || []).map((o) => o.id);
    const organisations = orgIds.length ? await Organization.find({ _id: { $in: orgIds } }).lean() : [];

    return res.status(200).send({ ok: true, token: req.cookies?.jwt, user, organisations });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("jwt");
  res.status(200).send({ ok: true });
});

router.post("/search", passport.authenticate("user", { session: false }), async (req, res) => {
  try {
    const limit = parseInt(req.body.limit) || 25;
    const page = parseInt(req.body.page) || 1;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.body.search) {
      const re = { $regex: req.body.search, $options: "i" };
      query.$or = [{ firstname: re }, { lastname: re }, { email: re }];
    }
    if (req.body.organization_id) query["organisations.id"] = req.body.organization_id;

    const [data, total] = await Promise.all([User.find(query).sort({ created_at: -1 }).skip(skip).limit(limit), User.countDocuments(query)]);
    return res.status(200).send({ ok: true, data, total, page, limit });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.get("/:id", passport.authenticate("user", { session: false }), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).send({ ok: false, code: NOT_FOUND });
    return res.status(200).send({ ok: true, data: user });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.put("/", passport.authenticate("user", { session: false }), async (req, res) => {
  try {
    const data = await User.findByIdAndUpdate(req.user._id, req.body, { new: true });
    return res.status(200).send({ ok: true, data });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.put("/:id", passport.authenticate("user", { session: false }), async (req, res) => {
  try {
    if (!req.user.role_admin && req.user._id.toString() !== req.params.id) {
      return res.status(403).send({ ok: false, code: "FORBIDDEN" });
    }
    const data = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.status(200).send({ ok: true, data });
  } catch (err) {
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

module.exports = router;
