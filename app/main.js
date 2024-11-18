const net = require("net");

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

const store = [];

// Uncomment this block to pass the first stage
const server = net.createServer((connection) => {
  connection.on("data", (data) => {
    if (data.toString() == "*1\r\n$4\r\nPING\r\n") {
      connection.write("+PONG\r\n");
    }
    if (data.toString().startsWith("*2\r\n$4\r\nECHO\r\n")) {
      connection.write(data.toString().split("*2\r\n$4\r\nECHO\r\n")[1]);
    }
    if (data.toString().startsWith("*3\r\n$3\r\nSET\r\n")) {
      const dataToSet = data
        .toString()
        .split("*3\r\n$3\r\nSET\r\n")[1]
        .split("\r\n");
      const key = dataToSet[1];
      const value = dataToSet[3];
      store.push({ key, value });
      connection.write("+OK\r\n");
    }
    if (data.toString().startsWith("*2\r\n$3\r\nGET\r\n")) {
      const key = data
        .toString()
        .split("*2\r\n$3\r\nGET\r\n")[1]
        .split("\r\n")[1];
      const keyValuePair = store.find((data) => data.key == key);
      if (keyValuePair) {
        connection.write(
          `$${keyValuePair.value.length}\r\n${keyValuePair.value}\r\n`
        );
      } else {
        connection.write("$-1\r\n");
      }
    }
  });
});

server.listen(6379, "127.0.0.1");
