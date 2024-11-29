/**
 * @typedef {Object} StoreData
 * @property {string} key - key
 * @property {string} value - value
 */

/**
 * @typedef {Object} Store
 * @property {StoreData[]} data
 */

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
 * @typedef {Object} StreamData
 * @property {string} streamKey - The identifier for the stream (e.g., "apple")
 * @property {StreamEntry[]} stream - Array of stream entries
 */

/**
 * @typedef {Object} Stream
 * @property {StreamData[]} data - The identifier for the stream (e.g., "apple")
 */
