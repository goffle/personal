const express = require("express");
const crypto = require("crypto");
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
const FORBIDDEN = "FORBIDDEN";
const INVITE_INVALID = "INVITE_INVALID";
const ALREADY_MEMBER = "ALREADY_MEMBER";

const INVITE_TTL_DAYS = 7;

function membership(user, orgId) {
  return (user.organisations || []).find((o) => o.id === orgId);
}

function canManage(user, orgId) {
  const m = membership(user, orgId);
  return m && (m.role === "owner" || m.role === "admin");
}

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
    const isSelf = req.user._id.toString() === req.params.id;
    const isSysAdmin = !!req.user.role_admin;
    const { organization_id, role, firstname, lastname, email, avatar } = req.body;

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).send({ ok: false, code: NOT_FOUND });

    // Role change within an org: requires canManage on that org, never self.
    if (role !== undefined || organization_id !== undefined) {
      if (!organization_id || !["owner", "admin", "member"].includes(role)) {
        return res.status(400).send({ ok: false, code: INVALID_BODY });
      }
      if (!canManage(req.user, organization_id)) return res.status(403).send({ ok: false, code: FORBIDDEN });
      if (isSelf) return res.status(400).send({ ok: false, code: "CANNOT_CHANGE_OWN_ROLE" });
      const m = (target.organisations || []).find((o) => o.id === organization_id);
      if (!m) return res.status(404).send({ ok: false, code: NOT_FOUND });
      m.role = role;
      target.markModified("organisations");
    }

    // Profile fields: self, sysadmin, or org owner/admin sharing an org with target.
    const hasProfileEdit = firstname !== undefined || lastname !== undefined || email !== undefined || avatar !== undefined;
    if (hasProfileEdit) {
      if (!isSelf && !isSysAdmin) {
        const sharedManaged = (target.organisations || []).some((o) => canManage(req.user, o.id));
        if (!sharedManaged) return res.status(403).send({ ok: false, code: FORBIDDEN });
      }
      if (firstname !== undefined) target.firstname = firstname;
      if (lastname !== undefined) target.lastname = lastname;
      if (email !== undefined) target.email = (email || "").trim().toLowerCase();
      if (avatar !== undefined) target.avatar = avatar;
    }

    await target.save();
    return res.status(200).send({ ok: true, data: target });
  } catch (err) {
    if (err.code === 11000) return res.status(409).send({ ok: false, code: USER_ALREADY_EXISTS });
    console.error(err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.post("/invite", passport.authenticate("user", { session: false }), async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const organization_id = req.body.organization_id;
    const role = ["owner", "admin", "member"].includes(req.body.role) ? req.body.role : "member";

    if (!email || !organization_id) return res.status(400).send({ ok: false, code: INVALID_BODY });
    if (!canManage(req.user, organization_id)) return res.status(403).send({ ok: false, code: FORBIDDEN });

    const org = await Organization.findById(organization_id);
    if (!org) return res.status(404).send({ ok: false, code: NOT_FOUND });

    let user = await User.findOne({ email });

    if (user && membership(user, organization_id)) {
      return res.status(409).send({ ok: false, code: ALREADY_MEMBER });
    }

    if (user) {
      user.organisations.push({ id: org._id.toString(), name: org.name, role });
      await user.save();
      return res.status(200).send({ ok: true, data: user, already_existed: true });
    }

    const token = crypto.randomBytes(24).toString("hex");
    user = await User.create({
      email,
      organisations: [{ id: org._id.toString(), name: org.name, role }],
      invite_token: token,
      invite_expires_at: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      invited_by: req.user._id.toString(),
    });

    const accept_url = `${config.APP_URL}/auth/accept-invite?token=${token}`;
    return res.status(200).send({ ok: true, data: user, accept_url });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.post("/accept-invite", async (req, res) => {
  try {
    const { token, password, firstname, lastname } = req.body;
    if (!token || !password) return res.status(400).send({ ok: false, code: INVALID_BODY });
    if (!validatePassword(password)) return res.status(400).send({ ok: false, code: PASSWORD_NOT_VALIDATED });

    const user = await User.findOne({ invite_token: token });
    if (!user || !user.invite_expires_at || user.invite_expires_at < new Date()) {
      return res.status(400).send({ ok: false, code: INVITE_INVALID });
    }

    user.password = password;
    if (firstname) user.firstname = firstname;
    if (lastname) user.lastname = lastname;
    user.invite_token = undefined;
    user.invite_expires_at = undefined;
    user.registered_at = new Date();
    user.last_login_at = new Date();
    await user.save();

    const orgIds = (user.organisations || []).map((o) => o.id);
    const organisations = orgIds.length ? await Organization.find({ _id: { $in: orgIds } }).lean() : [];

    const tk = jwt.sign({ _id: user._id }, config.JWT_SECRET, { expiresIn: JWT_MAX_AGE });
    res.cookie("jwt", tk, cookieOptions());
    return res.status(200).send({ ok: true, token: tk, user: user.toJSON(), organisations });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

router.delete("/:id", passport.authenticate("user", { session: false }), async (req, res) => {
  try {
    const organization_id = req.query.organization_id || req.body.organization_id;
    if (!organization_id) return res.status(400).send({ ok: false, code: INVALID_BODY, message: "organization_id required" });

    const isSelf = req.user._id.toString() === req.params.id;
    if (!isSelf && !canManage(req.user, organization_id)) {
      return res.status(403).send({ ok: false, code: FORBIDDEN });
    }

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).send({ ok: false, code: NOT_FOUND });
    if (!membership(target, organization_id)) return res.status(404).send({ ok: false, code: NOT_FOUND });

    const remaining = target.organisations.filter((o) => o.id !== organization_id);
    if (remaining.length === 0) {
      await User.findByIdAndDelete(target._id);
    } else {
      target.organisations = remaining;
      await target.save();
    }
    return res.status(200).send({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).send({ ok: false, code: SERVER_ERROR });
  }
});

module.exports = router;
