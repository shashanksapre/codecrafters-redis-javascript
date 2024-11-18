import config from "./config.js";
import initialiseRedis from "./server.js";

const portIndex = process.argv.indexOf("--port");
const PORT = portIndex === -1 ? 6379 : process.argv[portIndex + 1];
const serverRole =
  process.argv.indexOf("--replicaof") === -1 ? "master" : "slave";

const master = process.argv[process.argv.indexOf("--replicaof") + 1];

config.port = PORT;
config.role = serverRole;
config.masterHost = master.split(" ")[0];
config.masterPort = master.split(" ")[1];

initialiseRedis(config);
