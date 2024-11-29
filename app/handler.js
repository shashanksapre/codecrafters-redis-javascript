/** @typedef {import('node:net').Socket} Connection */

import "./types/io.js";

import store from "./data/store.js";
import streams from "./data/streams.js";
import block from "./data/block.js";
import { readStream } from "./serivices/stream.js";
import multi from "./data/multi.js";

/**
 * @param {string[]} data
 * @param {Connection} conn
 * @returns
 */
export function requestHandler(data, conn) {
  const command = data[0];
  if (
    multi.isActive &&
    multi.conn === conn &&
    !["exec", "discard"].includes(command)
  ) {
    multi.queue.push({ conn, data });
    return { type: "simple", data: "QUEUED" };
  } else {
    switch (command) {
      case "ping":
        return { type: "simple", data: "PONG" };
      case "echo":
        const arg = data[1];
        return { type: "bulk", data: arg };
      case "set":
        const key = data[1];
        const value = data[2];
        const extra = data[3];

        if (extra && extra === "px") {
          const time = Number(data[4]);
          store.data.push({ key, value });
          setTimeout(() => {
            store.data = store.data.filter((pair) => pair.key !== key);
          }, time);
        } else {
          store.data.push({ key, value });
        }
        return { type: "simple", data: "OK" };
      case "incr":
        const keyIncr = data[1];
        const kvp = store.data.find((data) => data.key === keyIncr);
        if (kvp) {
          if (!isNaN(kvp.value)) {
            store.data = [
              ...store.data.filter((data) => data.key != keyIncr),
              { ...kvp, value: (Number(kvp.value) + 1).toString() },
            ];
            return { type: "int", data: Number(kvp.value) + 1 };
          } else {
            return {
              type: "error",
              data: {
                code: "E3",
                description: "value is not an integer or out of range",
              },
            };
          }
        } else {
          store.data.push({ key: keyIncr, value: "1" });
          return { type: "int", data: 1 };
        }
      case "get":
        const keySearch = data[1];
        const keyValuePair = store.data.find((data) => data.key === keySearch);
        if (keyValuePair) {
          return { type: "bulk", data: keyValuePair.value };
        } else {
          return { type: "null", data: "-1" };
        }
      case "type":
        const typeSearch = data[1];
        const pair = store.data.find((data) => data.key === typeSearch);
        const str = streams.data.find((data) => data.streamKey === typeSearch);
        if (pair) {
          return { type: "simple", data: typeof pair.value };
        } else if (str) {
          return { type: "simple", data: "stream" };
        } else {
          return { type: "simple", data: "none" };
        }
      case "xadd":
        const streamKey = data[1];
        const inputStreamId = data[2];
        let timestamp, seqNumber, newStreamId, lastStreamId;
        const stream = streams.data.find(
          (data) => data.streamKey === streamKey
        );
        const streamData = [];
        for (let i = 3; i < data.length; i = i + 2) {
          streamData.push({ key: data[i], value: data[i + 1] });
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
          streams.data.push({
            streamKey,
            stream: [{ streamId: newStreamId, streamData }],
          });
        } else {
          streams.data = streams.data.filter((s) => s.streamKey !== streamKey);
          streams.data.push({
            streamKey,
            stream: [...stream.stream, { streamId: newStreamId, streamData }],
          });
        }
        if (block.isActive && block.streamArgs.includes(streamKey)) {
          const blockReadResponse = readStream(
            block.newOnly ? [streamKey, newStreamId] : block.streamArgs,
            block.newOnly
          );
          responseHandler(
            { type: "xread", data: blockReadResponse },
            block.conn
          );
          block.isActive = false;
          block.streamArgs = null;
          block.newOnly = false;
          block.conn = null;
        }
        return { type: "bulk", data: newStreamId };
      case "xrange":
        const streamRangeKey = data[1];
        let startId = data[2];
        let endId = data[3];
        const existingStream = streams.data.find(
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
              Number(stream.streamId.split("-")[0]) >=
                Number(startIdSplit[0]) &&
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
        const streamArgs = data.slice(data.indexOf("streams") + 1);
        let streamReadResponse = [];
        if (data[1] === "block") {
          const time = Number(data[2]);
          if (time != 0) {
            return new Promise((resolve) => {
              setTimeout(() => {
                const resp = readStream(streamArgs);
                if (resp[0] && resp.some((srr) => srr.stream[0])) {
                  resolve({ type: "xread", data: resp });
                } else {
                  resolve({ type: "null", data: "-1" });
                }
              }, time);
            });
          } else {
            block.isActive = true;
            block.streamArgs = streamArgs;
            block.newOnly = data.includes("$");
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
      case "multi":
        if (multi.isActive && multi.conn !== conn) {
          return {
            type: "error",
            data: { code: "E5", description: "MULTI nested" },
          };
        }
        multi.isActive = true;
        multi.conn = conn; // Store the connection that started MULTI
        return { type: "simple", data: "OK" };
      case "exec":
        if (multi.isActive && multi.conn === conn) {
          if (multi.queue.length < 1) {
            multi.isActive = false;
            multi.conn = null; // Clear the connection
            return { type: "empty", data: "0" };
          }
          const resp = [];
          multi.isActive = false;
          for (const item of multi.queue) {
            resp.push(requestHandler(item.data, item.conn));
          }
          multi.conn = null; // Clear the connection
          return { type: "exec", data: resp };
        } else {
          return {
            type: "error",
            data: { code: "E4", description: "EXEC without MULTI" },
          };
        }
      case "discard":
        if (multi.isActive && multi.conn === conn) {
          multi.isActive = false;
          multi.conn = null;
          multi.queue = [];
          return { type: "simple", data: "OK" };
        } else {
          return {
            type: "error",
            data: { code: "E6", description: "DISCARD without MULTI" },
          };
        }
      default:
        console.log(`Received: ${data.toString()}`);
        return {
          type: "error",
          data: { code: "E0", description: "unknown command" },
        };
    }
  }
}

/**
 *
 * @param {ResponseBody} response
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
    case "empty":
      conn.write("*0\r\n");
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
    case "exec":
      let execResponseString = `*${response.data.length}\r\n`;
      for (let i = 0; i < response.data.length; i++) {
        if (response.data[i].type === "int") {
          execResponseString += `:${response.data[i].data}\r\n`;
        }
        if (response.data[i].type === "simple") {
          execResponseString += `+${response.data[i].data}\r\n`;
        }
        if (response.data[i].type === "bulk") {
          execResponseString += `$${
            response.data[i].data.toString().length
          }\r\n${response.data[i].data.toString()}\r\n`;
        }
      }
      conn.write(execResponseString);
      break;
  }
}
