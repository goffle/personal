const express = require("express");
const passport = require("passport");

const SERVER_ERROR = "SERVER_ERROR";
const NOT_FOUND = "NOT_FOUND";

/**
 * Generic CRUD router factory.
 *
 * @param {mongoose.Model} Model
 * @param {object} opts
 * @param {string[]} opts.searchFields    text fields to apply $regex on req.body.search
 * @param {string[]} opts.filterFields    fields copied verbatim from req.body to the query
 * @param {object}   opts.defaultSort     mongoose sort spec (default: { created_at: -1 })
 * @param {function} opts.beforeCreate    (req) => extraFields to merge into the new doc
 * @param {function} opts.scopeQuery      (req, query) => mutate query for additional scoping
 */
function buildCrud(Model, opts = {}) {
  const router = express.Router();
  const auth = passport.authenticate(["user", "admin"], { session: false });

  const {
    searchFields = ["name"],
    filterFields = ["organization_id"],
    defaultSort = { created_at: -1 },
    beforeCreate = null,
    scopeQuery = null,
  } = opts;

  router.post("/search", auth, async (req, res) => {
    try {
      const limit = parseInt(req.body.limit) || 25;
      const page = parseInt(req.body.page) || 1;
      const skip = (page - 1) * limit;

      const query = {};
      if (req.body.search && searchFields.length) {
        const re = { $regex: req.body.search, $options: "i" };
        query.$or = searchFields.map((f) => ({ [f]: re }));
      }
      filterFields.forEach((f) => {
        if (req.body[f] !== undefined && req.body[f] !== null && req.body[f] !== "") query[f] = req.body[f];
      });
      if (scopeQuery) scopeQuery(req, query);

      const sort = req.body.sort || defaultSort;
      const [data, total] = await Promise.all([Model.find(query).sort(sort).skip(skip).limit(limit), Model.countDocuments(query)]);
      return res.status(200).send({ ok: true, data, total, page, limit });
    } catch (err) {
      console.error(err);
      return res.status(500).send({ ok: false, code: SERVER_ERROR });
    }
  });

  router.get("/:id", auth, async (req, res) => {
    try {
      const data = await Model.findById(req.params.id);
      if (!data) return res.status(404).send({ ok: false, code: NOT_FOUND });
      return res.status(200).send({ ok: true, data });
    } catch (err) {
      return res.status(500).send({ ok: false, code: SERVER_ERROR });
    }
  });

  router.post("/", auth, async (req, res) => {
    try {
      const payload = { ...req.body };
      payload.created_by = req.user._id.toString();
      if (beforeCreate) Object.assign(payload, await beforeCreate(req));
      const data = await Model.create(payload);
      return res.status(200).send({ ok: true, data });
    } catch (err) {
      console.error(err);
      return res.status(500).send({ ok: false, code: SERVER_ERROR, message: err.message });
    }
  });

  router.put("/:id", auth, async (req, res) => {
    try {
      const data = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!data) return res.status(404).send({ ok: false, code: NOT_FOUND });
      return res.status(200).send({ ok: true, data });
    } catch (err) {
      return res.status(500).send({ ok: false, code: SERVER_ERROR });
    }
  });

  router.delete("/:id", auth, async (req, res) => {
    try {
      const data = await Model.findByIdAndDelete(req.params.id);
      if (!data) return res.status(404).send({ ok: false, code: NOT_FOUND });
      return res.status(200).send({ ok: true });
    } catch (err) {
      return res.status(500).send({ ok: false, code: SERVER_ERROR });
    }
  });

  return router;
}

module.exports = { buildCrud };
