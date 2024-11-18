import { config } from "dotenv";
import { createServer } from "net";

config();

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

let store = [];

// Uncomment this block to pass the first stage
const server = createServer((connection) => {
  connection.on("data", (data) => {
    const splitData = data.toString().split("\r\n");
    const command = splitData[2];

    switch (command.toLowerCase()) {
      case "ping":
        connection.write("+PONG\r\n");
        break;
      case "echo":
        const arg = splitData[4];
        connection.write(`$${arg.length}\r\n${arg}\r\n`);
        break;
      case "set":
        const key = splitData[4];
        const value = splitData[6];
        const extra = splitData[8];

        if (extra && extra.toLowerCase() === "px") {
          const time = Number(splitData[10]);
          store.push({ key, value });
          setTimeout(() => {
            store = store.filter((pair) => pair.key != key);
          }, time);
          connection.write("+OK\r\n");
          break;
        } else {
          store.push({ key, value });
          connection.write("+OK\r\n");
        }
        break;
      case "get":
        const keySearch = splitData[4];
        const keyValuePair = store.find((data) => (data.key = keySearch));
        if (keyValuePair) {
          connection.write(
            `$${keyValuePair.value.length}\r\n${keyValuePair.value}\r\n`
          );
        } else {
          connection.write("$-1\r\n");
        }
        break;
    }
  });
});

// const server2 = createServer((conn) => {});

// server.listen(6379, "127.0.0.1");

server.listen(
  process.argv.indexOf("--port") === -1
    ? 6379
    : process.argv[process.argv.indexOf("--port") + 1],
  "127.0.0.1"
);
