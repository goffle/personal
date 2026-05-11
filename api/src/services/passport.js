const passport = require("passport");
const { Strategy: JwtStrategy, ExtractJwt } = require("passport-jwt");

const User = require("../models/user");
const { JWT_SECRET } = require("../config");

const jwtFromRequest = ExtractJwt.fromExtractors([
  ExtractJwt.fromAuthHeaderWithScheme("JWT"),
  (req) => (req && req.cookies ? req.cookies.jwt : null),
]);

const opts = { jwtFromRequest, secretOrKey: JWT_SECRET };

const userStrategy = new JwtStrategy(opts, async (payload, done) => {
  try {
    const user = await User.findById(payload._id);
    if (!user) return done(null, false);
    return done(null, user);
  } catch (err) {
    return done(err, false);
  }
});

const adminStrategy = new JwtStrategy(opts, async (payload, done) => {
  try {
    const user = await User.findById(payload._id);
    if (!user || !user.role_admin) return done(null, false);
    return done(null, user);
  } catch (err) {
    return done(err, false);
  }
});

module.exports = (app) => {
  passport.use("user", userStrategy);
  passport.use("admin", adminStrategy);
  app.use(passport.initialize());
};
