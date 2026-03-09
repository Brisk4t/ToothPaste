/**
 * Simple EventEmitter implementation that works in browser and Node.js
 * without depending on Node.js events module
 */
export class EventEmitter {
  constructor() {
    this._events = {};
    this._maxListeners = 10;
  }

  on(eventName, callback) {
    if (!this._events[eventName]) {
      this._events[eventName] = [];
    }
    this._events[eventName].push(callback);
    return this;
  }

  once(eventName, callback) {
    const wrapper = (...args) => {
      callback(...args);
      this.removeListener(eventName, wrapper);
    };
    return this.on(eventName, wrapper);
  }

  emit(eventName, ...args) {
    if (!this._events[eventName]) {
      return false;
    }
    this._events[eventName].forEach(callback => {
      try {
        callback(...args);
      } catch (err) {
        console.error(`Error in ${eventName} listener:`, err);
      }
    });
    return true;
  }

  removeListener(eventName, callback) {
    if (!this._events[eventName]) {
      return this;
    }
    this._events[eventName] = this._events[eventName].filter(cb => cb !== callback);
    return this;
  }

  removeAllListeners(eventName) {
    if (eventName) {
      delete this._events[eventName];
    } else {
      this._events = {};
    }
    return this;
  }

  listenerCount(eventName) {
    if (!this._events[eventName]) {
      return 0;
    }
    return this._events[eventName].length;
  }

  listeners(eventName) {
    return this._events[eventName] ? [...this._events[eventName]] : [];
  }

  setMaxListeners(n) {
    this._maxListeners = n;
    return this;
  }

  getMaxListeners() {
    return this._maxListeners;
  }
}
