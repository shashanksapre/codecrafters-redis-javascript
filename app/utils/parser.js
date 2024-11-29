/**
 *
 * @param {Buffer|string} data
 * @returns {string[]}
 */
export function parseRequest(data) {
  return data
    .toString()
    .toLowerCase()
    .split("\r\n")
    .filter(
      (data) => !/\*[0-9]+/.test(data) && !/\$[0-9]+/.test(data) && data !== ""
    );
}

/**
 *
 * @param {Buffer} data
 * @returns {string[]}
 */
export function parseSlaveRequest(data) {
  return data
    .toString()
    .toLowerCase()
    .split("*3")
    .filter((commands) => !/^\$[0-9]+/.test(commands) && commands !== "");
}
