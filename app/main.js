const net = require("net");

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

// Uncomment this block to pass the first stage
const server = net.createServer((connection) => {
  connection.on("data", (data) => {
    if (data.toString() == "*1\r\n$4\r\nPING\r\n") {
      connection.write("+PONG\r\n");
    }
    if (data.toString().startsWith("*2\r\n$4\r\nECHO\r\n")) {
      connection.write(data.toString().split("*2\r\n$4\r\nECHO\r\n")[1]);
    }
  });
});

server.listen(6379, "127.0.0.1");
