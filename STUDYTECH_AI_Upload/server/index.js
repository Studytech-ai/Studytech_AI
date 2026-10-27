// Production server: serves the built app (dist/) and the /api/chat proxy.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeMiddleware } from "./handler.js";
import { shield } from "./firewall.js";

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

const server = http.createServer((req, res) => {
  shield(req, res, () => nodeMiddleware(req, res, () => {
    res.setHeader("x-content-type-options", "nosniff");
    let rel;
    try { rel = decodeURIComponent(req.url.split("?")[0]); } catch { res.statusCode = 400; return res.end("Bad request"); }
    let file = path.join(dist, rel);
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
    res.setHeader("content-type", types[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  }));
});
server.headersTimeout = 15000;
server.requestTimeout = 30000;
server.listen(process.env.PORT || 3000, () => console.log("STUDYTECH.AI running on http://localhost:" + (process.env.PORT || 3000)));

process.on("uncaughtException", (e) => console.error("[error]", e));
process.on("unhandledRejection", (e) => console.error("[error]", e));
