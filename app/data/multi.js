/** @typedef {import('node:net').Socket} Connection */

import "../types/data.js";

const multi = {
  clients: new Map(),
  /**
   * @param {Connection} conn
   * @returns {void}
   */
  addClient(conn) {
    this.clients.set(conn, {
      isActive: true,
      queue: [],
    });
  },
  /**
   * @param {Connection} conn
   */
  getClient(conn) {
    return this.clients.get(conn);
  },
  /**
   * @param {Connection} conn
   */
  removeClient(conn) {
    this.clients.delete(conn);
  },
};

export default multi;
