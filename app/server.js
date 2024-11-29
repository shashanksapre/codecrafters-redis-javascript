import { createServer, createConnection } from "node:net";

import { parseRequest, parseSlaveRequest } from "./utils/parser.js";
import { requestHandler, responseHandler } from "./handler.js";

const createRedisServer = (config) => {
  const rdbFile =
    "UkVESVMwMDEx+glyZWRpcy12ZXIFNy4yLjD6CnJlZGlzLWJpdHPAQPoFY3RpbWXCbQi8ZfoIdXNlZC1tZW3CsMQQAPoIYW9mLWJhc2XAAP/wbjv+wP9aog==";
  const server = createServer((conn) => {
    conn.on("data", (data) => {
      const parsedData = parseRequest(data);
      const command = parsedData[0];
      switch (command) {
        case "config":
          let responseString = "";
          switch (parsedData[1]) {
            case "get":
              if (parsedData[2] === "dir") {
                responseString += `*2\r\n$3\r\ndir\r\n$${config.dir.length}\r\n${config.dir}\r\n`;
              }
              if (parsedData[2] === "dbfilename") {
                responseString += `*2\r\n$3\r\ndir\r\n$${config.dbfilename.length}\r\n${config.dbfilename}\r\n`;
              }
              break;
          }
          conn.write(responseString);
          break;
        case "info":
          const extraInfo = parsedData[1];
          if (extraInfo && extraInfo == "replication") {
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
          if (parsedData[1] && parsedData[1] === "ack") {
            config.acks += 1;
          } else {
            conn.write("+OK\r\n");
          }
          break;
        case "psync":
          const rdbFileBuffer = Buffer.from(rdbFile + "\r\n", "base64");
          conn.write(`+FULLRESYNC ${config.replicationId} 0\r\n`);
          conn.write(`$${rdbFileBuffer.length.toString()}\r\n`);
          conn.write(rdbFileBuffer);
          // conn.write("\r\n");
          // config.replicaList.push(conn);
          config.replicaList.push({ conn, ack: 0 });
          config.acks += 1;
          break;
        case "wait":
          for (let i = 0; i < config.replicaList.length; i++) {
            config.replicaList[i].conn.write(
              "*3\r\n$8\r\nREPLCONF\r\n$6\r\nGETACK\r\n$1\r\n*\r\n"
            );
            config.replicaList[i].ack = 0;
          }
          if (config.acks >= Number(parsedData[1])) {
            conn.write(`:${config.acks}\r\n`);
          } else {
            setTimeout(() => {
              conn.write(`:${config.acks}\r\n`);
            }, Number(parsedData[2]));
          }
          break;
        default:
          const response = requestHandler(parsedData, conn);
          if (response.isActive) {
            response.conn = conn;
          } else if (response instanceof Promise) {
            response.then((val) => {
              responseHandler(val, conn);
            });
          } else {
            if (command === "set") {
              config.acks = 0;
              for (let i = 0; i < config.replicaList.length; i++) {
                config.replicaList[i].conn.write(data);
                config.replicaList[i].ack = 0;
              }
            }
            responseHandler(response, conn);
          }
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
    const parsedData = parseSlaveRequest(data);
    for (const commands of parsedData) {
      switch (state) {
        case "PING":
          if (commands.includes("pong")) {
            client.write(
              `*3\r\n$8\r\nREPLCONF\r\n$14\r\nlistening-port\r\n$4\r\n${config.port}\r\n`
            );
            state = "REPLCONF1";
          }
          break;
        case "REPLCONF1":
          if (commands.includes("ok")) {
            client.write(
              `*3\r\n$8\r\nREPLCONF\r\n$4\r\ncapa\r\n$6\r\npsync2\r\n`
            );
            state = "REPLCONF2";
          }
          break;
        case "REPLCONF2":
          if (commands.includes("ok")) {
            client.write(`*3\r\n$5\r\nPSYNC\r\n$1\r\n?\r\n$2\r\n-1\r\n`);
            state = "PSYNC";
          }
          break;
        case "PSYNC":
          if (
            commands.includes("fullresync") ||
            commands.includes("redis-bits")
          ) {
            // Do something with the rdb file
          } else {
            const command = parseRequest(commands);
            if (command.includes("getack")) {
              let commandLength = 4;
              for (const data of command) {
                commandLength +=
                  1 + data.length.toString().length + 2 + data.length + 2;
              }
              client.write(
                `*3\r\n$8\r\nREPLCONF\r\n$3\r\nACK\r\n$${
                  config.offset.toString().length
                }\r\n${config.offset}\r\n`
              );
              config.offset = config.offset + commandLength;
            } else {
              requestHandler(command);
              let commandLength = 4;
              for (const data of command) {
                commandLength +=
                  1 + data.length.toString().length + 2 + data.length + 2;
              }
              config.offset = config.offset + commandLength;
            }
          }
          break;
      }
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
