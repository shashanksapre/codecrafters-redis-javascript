import { config } from "dotenv";
import { createServer, createConnection } from "net";
import { v4 } from "uuid";

config();

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

const portIndex = process.argv.indexOf("--port");
const PORT = portIndex === -1 ? 6379 : process.argv[portIndex + 1];
const serverRole =
  process.argv.indexOf("--replicaof") === -1 ? "master" : "slave";

const master = process.argv[process.argv.indexOf("--replicaof") + 1];

const rdbFile =
  "UkVESVMwMDEx+glyZWRpcy12ZXIFNy4yLjD6CnJlZGlzLWJpdHPAQPoFY3RpbWXCbQi8ZfoIdXNlZC1tZW3CsMQQAPoIYW9mLWJhc2XAAP/wbjv+wP9aog==";

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
          connection.write(
            `$${
              41 + serverRole.length + replId.length
            }\r\nrole:${serverRole}\rmaster_replid:${replId}\rmaster_repl_offset:0\r\n`
          );
        }
        break;
      case "replconf":
        connection.write("+OK\r\n");
        break;
      case "psync":
        connection.write(`+FULLRESYNC ${replId} 0\r\n`);
        const rdbFileBuffer = Buffer.from(rdbFile, "base64");
        connection.write(`$${rdbFileBuffer.length.toString()}\r\n`);
        connection.write(rdbFileBuffer);
        break;
      default:
        console.log(`Received: ${data.toString()}`);
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  if (serverRole === "slave") {
    const host = master.split(" ")[0];
    const port = master.split(" ")[1];
    const client = createConnection(port, host);
    let replConf = 1;

    client.on("data", (data) => {
      const splitData = data.toString().split("\r\n");
      switch (splitData[0].toLowerCase()) {
        case "+pong":
          client.write(
            `*3\r\n$8\r\nREPLCONF\r\n$14\r\nlistening-port\r\n$4\r\n${PORT}\r\n`
          );
          replConf = 2;
          break;
        case "+ok":
          if (replConf === 2) {
            client.write(
              `*3\r\n$8\r\nREPLCONF\r\n$4\r\ncapa\r\n$6\r\npsync2\r\n`
            );
            replConf = 3;
          } else if (replConf === 3) {
            client.write(`*3\r\n$5\r\nPSYNC\r\n$1\r\n?\r\n$2\r\n-1\r\n`);
          }
          break;
      }
    });
    client.write("*1\r\n$4\r\nPING\r\n");
  }
});
