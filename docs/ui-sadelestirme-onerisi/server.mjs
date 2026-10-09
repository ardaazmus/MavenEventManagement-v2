import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = new URL(".", import.meta.url).pathname;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let file = url.pathname === "/" ? "menu-prototipi.html" : url.pathname.slice(1);
  file = path.join(root, path.normalize(file).replace(/^(\.\.[\/\\])+/, ""));
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": file.endsWith(".html") ? "text/html; charset=utf-8" : "text/plain" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
server.listen(4173, "0.0.0.0", () => console.log("listening 4173"));
