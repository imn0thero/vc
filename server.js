const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = [];

wss.on("connection", (ws) => {
  clients.push(ws);
  ws.on("message", (message) => {
    clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });
  ws.on("close", () => {
    clients = clients.filter((c) => c !== ws);
  });
});

app.use(express.static(path.join(__dirname, "public")));

server.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
