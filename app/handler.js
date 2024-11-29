/** @typedef {import('node:net').Socket} Connection */

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

const block = {
  isActive: false,
  streams: null,
  conn: null,
  newOnly: false,
};

/**
 * @typedef {Object} Response
 * @property {string} type
 * @property {Object} data
 */

/**
 * @param {string[]} streamArgs
 * @returns {Response}
 */
function readStream(streamArgs, newOnly = false) {
  const streamKeysLength = streamArgs.length / 2;
  const streamKeysAndIds = [];
  const streamReadResponse = [];
  for (let i = 0; i < streamKeysLength; i++) {
    streamKeysAndIds.push({
      key: streamArgs[i],
      id: streamArgs[i + streamKeysLength],
    });
  }
  streamKeysAndIds.forEach((keyAndId) => {
    let readValue;
    const stream = streams.find((stream) => stream.streamKey === keyAndId.key);
    if (stream) {
      let readIdSplit;
      readValue = stream.stream.filter(
        (stream) => stream.streamId >= keyAndId.id
      );
      readIdSplit = keyAndId.id.split("-");
      readValue = stream.stream.filter(
        (stream) =>
          Number(stream.streamId.split("-")[0]) >= Number(readIdSplit[0])
      );
      if (readIdSplit[1]) {
        readValue = readValue.filter(
          (stream) =>
            (newOnly &&
              Number(stream.streamId.split("-")[1]) >=
                Number(readIdSplit[1])) ||
            Number(stream.streamId.split("-")[1]) > Number(readIdSplit[1])
        );
      }
      streamReadResponse.push({
        streamKey: keyAndId.key,
        stream: readValue,
      });
    }
  });
  return streamReadResponse;
}

/**
 * @param {Buffer} data
 * @param {*} config
 * @returns
 */
export function requestHandler(data, config) {
  const splitData = data.toString().split("\r\n");
  const command = splitData[2];

  switch (command.toLowerCase()) {
    case "ping":
      return { type: "simple", data: "PONG" };
    case "echo":
      const arg = splitData[4];
      return { type: "bulk", data: arg };
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
      return { type: "simple", data: "OK" };
    case "incr":
      const keyIncr = splitData[4];
      const kvp = store.find((data) => data.key === keyIncr);
      if (kvp) {
        if (!isNaN(kvp.value)) {
          store = [
            ...store.filter((data) => data.key != keyIncr),
            { ...kvp, value: (Number(kvp.value) + 1).toString() },
          ];
          return { type: "int", data: Number(kvp.value) + 1 };
        } else {
          return {
            type: "error",
            data: { code: "E3", description: "Not an interger" },
          };
        }
      } else {
        store.push({ key: keyIncr, value: "1" });
        return { type: "int", data: 1 };
      }
    case "get":
      const keySearch = splitData[4];
      const keyValuePair = store.find((data) => data.key === keySearch);
      if (keyValuePair) {
        return { type: "bulk", data: keyValuePair.value };
      } else {
        return { type: "null", data: "-1" };
      }
    case "type":
      const typeSearch = splitData[4];
      const pair = store.find((data) => data.key === typeSearch);
      const str = streams.find((data) => data.streamKey === typeSearch);
      if (pair) {
        return { type: "simple", data: typeof pair.value };
      } else if (str) {
        return { type: "simple", data: "stream" };
      } else {
        return { type: "simple", data: "none" };
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
        newStreamId = `${Date.now()}-0`;
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
            return {
              type: "error",
              data: {
                code: "E1",
                description:
                  "The ID specified in XADD must be greater than 0-0",
              },
            };
          }
          if (stream) {
            const lastStreamIdSplit = lastStreamId.split("-");
            if (lastStreamIdSplit[0] > inputStreamIdSplit[0]) {
              return {
                type: "error",
                data: {
                  code: "E2",
                  description:
                    "The ID specified in XADD is equal or smaller than the target stream top item",
                },
              };
            }
            if (
              lastStreamIdSplit[0] == inputStreamIdSplit[0] &&
              lastStreamIdSplit[1] >= inputStreamIdSplit[1]
            ) {
              return {
                type: "error",
                data: {
                  code: "E2",
                  description:
                    "The ID specified in XADD is equal or smaller than the target stream top item",
                },
              };
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
      if (block.isActive && block.streams.includes(streamKey)) {
        const blockReadResponse = readStream(
          block.newOnly ? [streamKey, newStreamId] : block.streams,
          block.newOnly
        );
        responseHandler({ type: "xread", data: blockReadResponse }, block.conn);
        block.isActive = false;
        block.streams = null;
        block.newOnly = false;
        block.conn = null;
      }
      return { type: "bulk", data: newStreamId };
    case "xrange":
      const streamRangeKey = splitData[4];
      let startId = splitData[6];
      let endId = splitData[8];
      const existingStream = streams.find(
        (stream) => stream.streamKey === streamRangeKey
      );
      if (existingStream) {
        let returnValue;
        if (startId === "-") {
          startId = existingStream.stream[0].streamId;
        }
        if (endId === "+") {
          endId =
            existingStream.stream[existingStream.stream.length - 1].streamId;
        }
        const startIdSplit = startId.split("-");
        const endIdSplit = endId.split("-");
        returnValue = existingStream.stream.filter(
          (stream) =>
            Number(stream.streamId.split("-")[0]) >= Number(startIdSplit[0]) &&
            Number(stream.streamId.split("-")[0]) <= Number(endIdSplit[0])
        );
        if (startIdSplit[1]) {
          returnValue = returnValue.filter(
            (stream) =>
              Number(stream.streamId.split("-")[1]) >= Number(startIdSplit[1])
          );
        }
        if (endIdSplit[1]) {
          returnValue = returnValue.filter(
            (stream) =>
              Number(stream.streamId.split("-")[1]) <= Number(endIdSplit[1])
          );
        }
        return { type: "xrange", data: returnValue };
      } else {
        return { type: "null", data: "-1" };
      }
    case "xread":
      let parsedData = splitData.filter(
        (data) => !data.startsWith("*") && !/\$[0-9]+/.test(data) && data !== ""
      );
      const streamArgs = parsedData.slice(parsedData.indexOf("streams") + 1);
      let streamReadResponse = [];
      if (splitData[4].toLowerCase() === "block") {
        if (Number(splitData[6]) != 0) {
          return new Promise((resolve) => {
            setTimeout(() => {
              const resp = readStream(streamArgs);
              if (resp[0] && resp.some((srr) => srr.stream[0])) {
                resolve({ type: "xread", data: resp });
              } else {
                resolve({ type: "null", data: "-1" });
              }
            }, Number(splitData[6]));
          });
        } else {
          block.isActive = true;
          block.streams = streamArgs;
          block.newOnly = parsedData.includes("$");
        }
        return block;
      } else {
        streamReadResponse = readStream(streamArgs);
        if (
          streamReadResponse[0] &&
          streamReadResponse.every((srr) => srr.stream[0])
        ) {
          return { type: "xread", data: streamReadResponse };
        } else {
          return { type: "null", data: "-1" };
        }
      }
    default:
      console.log(`Received: ${data.toString()}`);
      return {
        type: "error",
        data: { code: "E0", description: "unknown command" },
      };
  }
}

/**
 *
 * @param {Response} response
 * @param {Connection} conn
 */
export function responseHandler(response, conn) {
  switch (response.type) {
    case "simple":
      conn.write(`+${response.data}\r\n`);
      break;
    case "bulk":
      conn.write(`$${response.data.length}\r\n${response.data}\r\n`);
      break;
    case "int":
      conn.write(`:${response.data}\r\n`);
      break;
    case "null":
      conn.write("$-1\r\n");
      break;
    case "error":
      conn.write(`-ERR ${response.data.description}\r\n`);
      break;
    case "xrange":
      let xrangeResponse = response.data;
      let rangeResponseString = `*${xrangeResponse.length}\r\n`;
      for (let i = 0; i < xrangeResponse.length; i++) {
        rangeResponseString +=
          "*2\r\n" +
          `$${xrangeResponse[i]["streamId"].length}\r\n` +
          `${xrangeResponse[i]["streamId"]}\r\n` +
          `*${xrangeResponse[i]["streamData"].length * 2}\r\n`;
        for (let j = 0; j < xrangeResponse[i]["streamData"].length; j++) {
          rangeResponseString +=
            `$${xrangeResponse[i]["streamData"][j]["key"].length}\r\n` +
            `${xrangeResponse[i]["streamData"][j]["key"]}\r\n` +
            `$${xrangeResponse[i]["streamData"][j]["value"].length}\r\n` +
            `${xrangeResponse[i]["streamData"][j]["value"]}\r\n`;
        }
      }
      conn.write(rangeResponseString);
      break;
    case "xread":
      let xreadResponse = response.data;
      let readResponseString = `*${xreadResponse.length}\r\n`;
      for (let i = 0; i < xreadResponse.length; i++) {
        readResponseString +=
          "*2\r\n" +
          `$${xreadResponse[i]["streamKey"].length}\r\n` +
          `${xreadResponse[i]["streamKey"]}\r\n` +
          `*${xreadResponse[i]["stream"].length}\r\n`;
        for (let j = 0; j < xreadResponse[i]["stream"].length; j++) {
          readResponseString +=
            `*2\r\n` +
            `$${xreadResponse[i]["stream"][j]["streamId"].length}\r\n` +
            `${xreadResponse[i]["stream"][j]["streamId"]}\r\n` +
            `*${xreadResponse[i]["stream"][j]["streamData"].length * 2}\r\n`;
          for (
            let k = 0;
            k < xreadResponse[i]["stream"][j]["streamData"].length;
            k++
          ) {
            readResponseString +=
              `$${xreadResponse[i]["stream"][j]["streamData"][k]["key"].length}\r\n` +
              `${xreadResponse[i]["stream"][j]["streamData"][k]["key"]}\r\n` +
              `$${xreadResponse[i]["stream"][j]["streamData"][k]["value"].length}\r\n` +
              `${xreadResponse[i]["stream"][j]["streamData"][k]["value"]}\r\n`;
          }
        }
      }
      conn.write(readResponseString);
      break;
  }
}
