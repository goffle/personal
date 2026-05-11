const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    firstname: { type: String, default: "" },
    lastname: { type: String, default: "" },
    avatar: { type: String, default: "" },

    role_admin: { type: Boolean, default: false },

    organisations: [
      {
        id: String,
        name: String,
        role: { type: String, enum: ["owner", "member", "admin"], default: "member" },
      },
    ],

    last_login_at: { type: Date },
    registered_at: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = function (candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

UserSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model("User", UserSchema);
