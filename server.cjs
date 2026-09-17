// Passenger owns the public listener and TLS. Keep application files outside
// the Apache document root; Next loads .env.local from this directory.
/* eslint-disable @typescript-eslint/no-require-imports -- Passenger loads a CommonJS startup file. */
const http = require("node:http");
const next = require("next");

process.env.NODE_ENV = "production";
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare()
  .then(() => {
    const server = http.createServer((request, response) => {
      handle(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end("No se pudo completar la solicitud.");
      });
    });
    // Passenger intercepts listen() and supplies its own private socket.
    server.listen(Number(process.env.PORT || 3000), "127.0.0.1");
  })
  .catch((error) => {
    console.error("No se pudo iniciar la aplicación:", error.message);
    process.exit(1);
  });
