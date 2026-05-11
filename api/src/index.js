const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const http = require("http");

require("./services/mongo");
const { PORT, APP_URL, ENVIRONMENT } = require("./config");

const app = express();
require("./services/passport")(app);

const origin = [APP_URL].filter(Boolean);
if (ENVIRONMENT === "development") {
  origin.push("http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000");
}

app.use(morgan("tiny"));
app.use(cors({ credentials: true, origin }));
app.use(bodyParser.json({ limit: "20mb" }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/user", require("./controllers/user"));
app.use("/organization", require("./controllers/organization"));
app.use("/chat", require("./controllers/chat"));
app.use("/message", require("./controllers/message"));
app.use("/agent", require("./controllers/agent"));
app.use("/task", require("./controllers/task"));
app.use("/comment", require("./controllers/comment"));
app.use("/file", require("./controllers/file"));
app.use("/cron-job", require("./controllers/cron-job"));
app.use("/skill", require("./controllers/skill"));
app.use("/connector", require("./controllers/connector"));
app.use("/mcp-server", require("./controllers/mcp-server"));
app.use("/tool", require("./controllers/tool"));

app.get("/", (_req, res) => res.status(200).send("Console API · " + new Date().toLocaleString()));

const server = http.createServer(app);
server.listen(PORT, () => console.log("Listening on port " + PORT));
