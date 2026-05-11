require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 8080,
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret",
  APP_URL: process.env.APP_URL || "http://localhost:3000",
  ENVIRONMENT: process.env.ENVIRONMENT || "development",
};
