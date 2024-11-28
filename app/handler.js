/**
 * @typedef {Object} StoreData
 * @property {string} key - key
 * @property {string} value - value
 */

/** @type {StoreData[]} */
let store = [];

/**
 * @typedef {Object} KeyValue
 * @property {string} key - The key name
 * @property {string} value - The corresponding value
 */

/**
 * @typedef {Object} StreamEntry
 * @property {string} streamId - The ID of the stream (e.g., "0-1")
 * @property {KeyValue[]} streamData - Array of key-value pairs in the stream
 */

/**
 * @typedef {Object} Stream
 * @property {string} streamKey - The identifier for the stream (e.g., "apple")
 * @property {StreamEntry[]} stream - Array of stream entries
 */

/** @type {Stream[]} */
let streams = [];

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
    case "type":
      const typeSearch = splitData[4];
      const pair = store.find((data) => data.key === typeSearch);
      const str = streams.find((data) => data.streamKey === typeSearch);
      if (pair) {
        return [typeof pair.value];
      } else if (str) {
        return ["stream"];
      } else {
        return ["none"];
      }
    case "xadd":
      const streamKey = splitData[4];
      const inputStreamId = splitData[6];
      let timestamp, seqNumber, newStreamId, lastStreamId;
      const stream = streams.find((data) => data.streamKey === streamKey);
      const streamData = [];
      for (let i = 8; i < splitData.length; i = i + 4) {
        streamData.push({ key: splitData[i], value: splitData[i + 2] });
      }
      if (stream) {
        lastStreamId = stream.stream[stream.stream.length - 1].streamId;
      }
      if (inputStreamId === "*") {
        // Generate timestamp and sequence number
      } else {
        const inputStreamIdSplit = inputStreamId.split("-");
        timestamp = inputStreamIdSplit[0];
        if (inputStreamIdSplit[1] === "*") {
          // Generate sequence number
          if (!stream) {
            seqNumber = timestamp == 0 ? 1 : 0;
          } else {
            const lastStreamIdSplit = lastStreamId.split("-");
            if (lastStreamIdSplit[0] == inputStreamIdSplit[0]) {
              seqNumber = Number(lastStreamIdSplit[1]) + 1;
            } else {
              seqNumber = 0;
            }
          }
          newStreamId = `${timestamp}-${seqNumber}`;
        } else {
          // Use Id as is
          if (inputStreamIdSplit[0] == 0 && inputStreamIdSplit[1] == 0) {
            return "E:GreaterThan0-0";
          }
          if (stream) {
            const lastStreamIdSplit = lastStreamId.split("-");
            if (lastStreamIdSplit[0] > inputStreamIdSplit[0]) {
              return "E:GreaterThanPrevious";
            }
            if (
              lastStreamIdSplit[0] == inputStreamIdSplit[0] &&
              lastStreamIdSplit[1] >= inputStreamIdSplit[1]
            ) {
              return "E:GreaterThanPrevious";
            }
          }
          newStreamId = inputStreamId;
        }
      }

      if (!stream) {
        streams.push({
          streamKey,
          stream: [{ streamId: newStreamId, streamData }],
        });
      } else {
        streams = streams.filter((s) => s.streamKey !== streamKey);
        streams.push({
          streamKey,
          stream: [...stream.stream, { streamId: newStreamId, streamData }],
        });
      }
      return newStreamId;
    default:
      console.log(`Received: ${data.toString()}`);
      return "E:0";
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
    case "E:0":
      conn.write("-ERR unknown command\r\n");
      break;
    case "E:GreaterThan0-0":
      conn.write("-ERR The ID specified in XADD must be greater than 0-0\r\n");
      break;
    case "E:GreaterThanPrevious":
      conn.write(
        "-ERR The ID specified in XADD is equal or smaller than the target stream top item\r\n"
      );
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
