import { config } from "dotenv";
import { createServer } from "net";
import { v4 } from "uuid";

config();

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

const portIndex = process.argv.indexOf("--port");
const PORT = portIndex === -1 ? 6379 : process.argv[portIndex + 1];
const serverRole =
  process.argv.indexOf("--replicaof") === -1 ? "master" : "slave";

let store = [];

// Uncomment this block to pass the first stage
const server = createServer((connection) => {
  const replId = "8371b4fb1155b71f4a04d3e1bc3e18c4a990aeeb";
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
      case "info":
        const extraInfo = splitData[4];
        if (extraInfo && extraInfo.toLowerCase() == "replication") {
          // connection.write(
          //   `$${5 + serverRole.length}\r\nrole:${serverRole}\r\n`
          // );
          // connection.write(`$20\r\nmaster_repl_offset:0\r\n`);
          connection.write(
            `$${
              34 + replId.length
            }\r\nmaster_replid:${replId}\rmaster_repl_offset:0\r\n`
          );
        }
        break;
    }
  });
});

server.listen(PORT, "127.0.0.1");
