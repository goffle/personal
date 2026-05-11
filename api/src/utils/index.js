function validatePassword(pw) {
  return typeof pw === "string" && pw.length >= 6;
}

function slugify(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

module.exports = { validatePassword, slugify };
