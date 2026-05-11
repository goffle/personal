const mongoose = require("mongoose");
const { MONGO_URI } = require("../config");

mongoose.set("strictQuery", false);

if (!MONGO_URI) {
  console.error("MONGO_URI is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("Mongo connected"))
  .catch((err) => {
    console.error("Mongo connection error:", err.message);
    process.exit(1);
  });

module.exports = mongoose;
