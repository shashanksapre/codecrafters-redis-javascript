let store = [];

export function requestHandler(data, config) {
  const splitData = data.toString().split("\r\n");

  const command = splitData[2];

  switch (command.toLowerCase()) {
    case "ping":
      return "PONG";
    case "echo":
      const arg = splitData[4];
      return arg;
    case "set":
      const key = splitData[4];
      const value = splitData[6];
      const extra = splitData[8];

      if (extra && extra.toLowerCase() === "px") {
        const time = Number(splitData[10]);
        store.push({ key, value });
        setTimeout(() => {
          store = store.filter((pair) => pair.key !== key);
        }, time);
      } else {
        store.push({ key, value });
      }
      return "OK";
    case "get":
      const keySearch = splitData[4];
      const keyValuePair = store.find((data) => data.key === keySearch);
      if (keyValuePair) {
        return keyValuePair.value;
      } else {
        return "NULL";
      }
    default:
      console.log(`Received: ${data.toString()}`);
      return "E";
  }
}

export function responseHandler(response, conn) {
  switch (response) {
    case "PONG":
      conn.write("+PONG\r\n");
      break;
    case "OK":
      conn.write("+OK\r\n");
      break;
    case "NULL":
      conn.write("$-1\r\n");
      break;
    case "E":
      conn.write("-ERR unknown command\r\n");
      break;
    default:
      if (Array.isArray(response)) {
        conn.write(`+${response[0]}\r\n`);
      } else {
        conn.write(`$${response.length}\r\n${response}\r\n`);
      }
      break;
  }
}
