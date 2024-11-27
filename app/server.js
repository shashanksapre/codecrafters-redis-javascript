import { createServer, createConnection } from "node:net";
import { requestHandler, responseHandler } from "./handler.js";

const createRedisServer = (config) => {
  const rdbFile =
    "UkVESVMwMDEx+glyZWRpcy12ZXIFNy4yLjD6CnJlZGlzLWJpdHPAQPoFY3RpbWXCbQi8ZfoIdXNlZC1tZW3CsMQQAPoIYW9mLWJhc2XAAP/wbjv+wP9aog==";
  const server = createServer((conn) => {
    conn.on("data", (data) => {
      const splitData = data.toString().split("\r\n");
      const command = splitData[2].toLowerCase();
      switch (command) {
        case "info":
          const extraInfo = splitData[4];
          if (extraInfo && extraInfo.toLowerCase() == "replication") {
            conn.write(
              `$${
                41 + config.role.length + config.replicationId.length
              }\r\nrole:${config.role}\rmaster_replid:${
                config.replicationId
              }\rmaster_repl_offset:0\r\n`
            );
          }
          break;
        case "replconf":
          conn.write("+OK\r\n");
          break;
        case "psync":
          conn.write(`+FULLRESYNC ${config.replicationId} 0\r\n`);
          const rdbFileBuffer = Buffer.from(rdbFile, "base64");
          conn.write(`$${rdbFileBuffer.length.toString()}\r\n`);
          conn.write(rdbFileBuffer);
          config.replicaList.push(conn);
          break;
        default:
          const response = requestHandler(data);
          if (command === "set") {
            for (const replicaConn of config.replicaList) {
              replicaConn.write(data);
            }
          }
          responseHandler(response, conn);
      }
    });
  });

  server.listen(config.port, config.host, () => {
    console.log("server started listening on port", config.port);
  });
};

const setUpSlave = (config) => {
  const client = createConnection(config.masterPort, config.masterHost);
  client.on("connect", () => {
    client.write("*1\r\n$4\r\nPING\r\n");
  });
  let state = "PING";
  client.on("data", (data) => {
    const splitData = data.toString().split("\r\n");
    switch (state) {
      case "PING":
        if (data.toString().toLowerCase().includes("pong")) {
          client.write(
            `*3\r\n$8\r\nREPLCONF\r\n$14\r\nlistening-port\r\n$4\r\n${config.port}\r\n`
          );
          state = "REPLCONF1";
        }
        break;
      case "REPLCONF1":
        if (data.toString().toLowerCase().includes("ok")) {
          client.write(
            `*3\r\n$8\r\nREPLCONF\r\n$4\r\ncapa\r\n$6\r\npsync2\r\n`
          );
          state = "REPLCONF2";
        }
        break;
      case "REPLCONF2":
        if (data.toString().toLowerCase().includes("ok")) {
          client.write(`*3\r\n$5\r\nPSYNC\r\n$1\r\n?\r\n$2\r\n-1\r\n`);
          state = "PSYNC";
        }
        break;
      case "PSYNC":
        if (data.toString().toLowerCase().includes("*")) {
          const commands = data
            .toString()
            .split("*")
            .filter((cmd) => cmd.length > 0);
          for (const command of commands) {
            if (command.toLowerCase().includes("getack")) {
              client.write("*3\r\n$8\r\nREPLCONF\r\n$3\r\nACK\r\n$1\r\n0\r\n");
            } else {
              requestHandler("*" + command, config.store);
            }
          }
        }
        break;
    }
  });
};

const initialiseRedis = (config) => {
  if (config.role === "master") {
    createRedisServer(config);
  } else {
    createRedisServer(config);
    setUpSlave(config);
  }
};

export default initialiseRedis;
