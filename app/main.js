const net = require("net");

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

let store = [];

// Uncomment this block to pass the first stage
const server = net.createServer((connection) => {
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

    // if (data.toString() == "*1\r\n$4\r\nPING\r\n") {
    // }
    // if (data.toString().startsWith("*2\r\n$4\r\nECHO\r\n")) {
    //   connection.write(data.toString().split("*2\r\n$4\r\nECHO\r\n")[1]);
    // }
    // if (data.toString().startsWith("*3\r\n$3\r\nSET\r\n")) {
    //   const dataToSet = data
    //     .toString()
    //     .split("*3\r\n$3\r\nSET\r\n")[1]
    //     .split("\r\n");
    //   const key = dataToSet[1];
    //   const value = dataToSet[3];
    //   store.push({ key, value });
    //   connection.write("+OK\r\n");
    // }
    // if (data.toString().startsWith("*2\r\n$3\r\nGET\r\n")) {
    //   const key = data
    //     .toString()
    //     .split("*2\r\n$3\r\nGET\r\n")[1]
    //     .split("\r\n")[1];
    //   const keyValuePair = store.find((data) => data.key == key);
    //   if (keyValuePair) {
    //     connection.write(
    //       `$${keyValuePair.value.length}\r\n${keyValuePair.value}\r\n`
    //     );
    //   } else {
    //     connection.write("$-1\r\n");
    //   }
    // }
  });
});

server.listen(6379, "127.0.0.1");
