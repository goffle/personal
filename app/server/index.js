import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(distDir));
app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
app.listen(PORT, "0.0.0.0", () => console.log(`listening on ${PORT}`));
