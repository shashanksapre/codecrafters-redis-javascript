import { getSize, getNextBytes } from "../utils/file.js";
import store from "../data/store.js";

/**
 * @param {Buffer} rdbFile
 */
export function rdbFileToStore(rdbFile) {
  let size = {
    length: 0,
    offset: 9,
  };
  // skip header
  let i = 9;
  // skip meta data
  while (rdbFile[i] === 0xfa) {
    i++;
    // Read key length
    const key = getNextBytes(i, rdbFile);
    // Skip key
    i = key.offset;
    // Read value length
    const value = getNextBytes(i, rdbFile);
    // Skip value
    i = value.offset;
  }
  // Start of database subsection
  i++;
  // database index
  size = getSize(i, rdbFile);
  const dbIndex = size.length;
  i = size.offset;
  // Hash tables size info
  i++;
  size = getSize(i, rdbFile);
  const hashTableSize = size.length;
  i = size.offset;
  size = getSize(i, rdbFile);
  const hashTableExpirySize = size.length;
  i = size.offset;
  while (i < rdbFile.length && rdbFile[i] != 0xff) {
    if (rdbFile[i] === 0xfd) {
      // Save data to store with expiry in seconds
    } else if (rdbFile[i] === 0xfc) {
      // Save data to store with expiry in milliseconds
    } else {
      // Save data to store
      i++; // Skipping type check for now.
      const key = getNextBytes(i, rdbFile);
      i = key.offset;
      const value = getNextBytes(i, rdbFile);
      i = value.offset;
      store.data.push({
        key: key.nextBytes.toString(),
        value: value.nextBytes.toString(),
      });
    }
  }
}
