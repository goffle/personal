const isProd = process.env.NODE_ENV === "production";

module.exports = {
  PORT: process.env.PORT || 8080,
  MONGO_URI: "mongodb+srv://selegoff_db_user:uigN9x7VYW1wwlC7@production.florode.mongodb.net/console?retryWrites=true&w=majority",
  JWT_SECRET: "dev-only-secret-replace-me",
  APP_URL: isProd ? "https://app.jeeve.me" : "http://localhost:3000",
  API_URL: isProd ? "https://api.jeeve.me" : "http://localhost:8080",
  ENVIRONMENT: isProd ? "production" : "development",
};
