import streams from "../data/streams.js";

/**
 * @param {string[]} streamArgs
 * @param {boolean} newOnly
 * @returns {StreamData[]}
 */
export function readStream(streamArgs, newOnly = false) {
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
    const stream = streams.data.find(
      (stream) => stream.streamKey === keyAndId.key
    );
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
