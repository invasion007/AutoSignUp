import http from "http";
import net from "net";

const UPSTREAM_HOST = process.env.UPSTREAM_HOST || "38.154.203.95";
const UPSTREAM_PORT = parseInt(process.env.UPSTREAM_PORT || "5863");
const UPSTREAM_USER = process.env.UPSTREAM_USER || "tlqpxdpl";
const UPSTREAM_PASS = process.env.UPSTREAM_PASS || "f2wwmd27mzu1";
const LOCAL_PORT = parseInt(process.env.LOCAL_PORT || "18080");

const authHeader = "Basic " + Buffer.from(`${UPSTREAM_USER}:${UPSTREAM_PASS}`).toString("base64");

const server = http.createServer((req, res) => {
  const upstreamReq = http.request({
    host: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    method: req.method,
    path: req.url,
    headers: {
      ...req.headers,
      "Proxy-Authorization": authHeader,
    },
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  req.pipe(upstreamReq);
  upstreamReq.on("error", (e) => {
    res.writeHead(502);
    res.end("Bad Gateway: " + e.message);
  });
});

server.on("connect", (req, clientSocket, head) => {
  const upstreamSocket = net.connect(UPSTREAM_PORT, UPSTREAM_HOST, () => {
    const connectReq = `CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\nProxy-Authorization: ${authHeader}\r\n\r\n`;
    upstreamSocket.write(connectReq);
    
    let responseData = "";
    upstreamSocket.once("data", (chunk) => {
      responseData = chunk.toString();
      if (responseData.includes("200")) {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length > 0) upstreamSocket.write(head);
        upstreamSocket.pipe(clientSocket);
        clientSocket.pipe(upstreamSocket);
      } else {
        clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        clientSocket.end();
        upstreamSocket.end();
      }
    });
  });
  
  upstreamSocket.on("error", (e) => {
    clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    clientSocket.end();
  });
  clientSocket.on("error", () => upstreamSocket.destroy());
});

server.listen(LOCAL_PORT, "127.0.0.1", () => {
  console.log(`Local proxy listening on 127.0.0.1:${LOCAL_PORT}`);
  console.log(`Forwarding to ${UPSTREAM_HOST}:${UPSTREAM_PORT} (with auth)`);
});
