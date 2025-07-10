import React, { useEffect, useRef, useState, useContext, useCallback } from "react";
import { ECDHContext } from "../context/ECDHContext";
import { BLEContext } from "../context/BLEContext";

// Async queue utility
function createAsyncQueue() {
  const queue = [];
  let resolvers = [];

  const push = (item) => {
    if (resolvers.length > 0) {
      const resolve = resolvers.shift();
      resolve(item);
    } else {
      queue.push(item);
    }
  };

  const iterator = {
    [Symbol.asyncIterator]: async function* () {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift();
        } else {
          const item = await new Promise((resolve) => {
            resolvers.push(resolve);
          });
          yield item;
        }
      }
    },
  };

  return { push, iterator };
}

export default function LiveCapture() {
  const [buffer, setBuffer] = useState("");              // what user is typing  
  const lastSentBuffer = useRef("");                     // tracks last sent buffer
  const bufferRef = useRef("");
  const debounceTimeout = useRef(null);
  const queueRef = useRef(createAsyncQueue());
  const processingRef = useRef(false);
  const { pktCharacteristic, status, readyToReceive } = useContext(BLEContext);
  const { createEncryptedPackets } = useContext(ECDHContext);
  const inputRef = useRef(null);
  
  const DEBOUNCE_INTERVAL_MS = 50;

  const waitForReady = useCallback(() => {
    if (!readyToReceive.current.promise) {
      readyToReceive.current.promise = new Promise((resolve) => {
        readyToReceive.current.resolve = resolve;
      });
    }
    return readyToReceive.current.promise;
  }, [readyToReceive]);

  // Polling logic: send latest buffer every N ms if changed
   const sendDiff = useCallback(async () => {
    const current = bufferRef.current;
    const previous = lastSentBuffer.current;

    if (current === previous) return;

    let payload = "";
    if (current.length > previous.length) {
      // New characters appended
      payload = current.slice(previous.length);
    } else {
      // Characters deleted, send backspaces
      const numDeleted = previous.length - current.length;
      payload = "\b".repeat(numDeleted);
    }

    // Update lastSentBuffer early to avoid duplicate sends
    lastSentBuffer.current = current;

    for await (const packet of createEncryptedPackets(0, payload)) {
      await pktCharacteristic.writeValueWithoutResponse(packet.serialize());

      waitForReady();
      await readyToReceive.current.promise;
    }
  }, [createEncryptedPackets, pktCharacteristic, waitForReady, readyToReceive]);

   const scheduleSend = useCallback(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    debounceTimeout.current = setTimeout(() => {
      sendDiff();
    }, DEBOUNCE_INTERVAL_MS);
  }, [sendDiff]);

   const handleKeyDown = (e) => {
    e.preventDefault();

    let newBuffer = bufferRef.current;

    if (e.key === "Backspace") {
      // Remove last char if any
      newBuffer = newBuffer.slice(0, -1);
    } else if (e.key.length === 1) {
      // Append regular character keys (length 1)
      newBuffer += e.key;
    } else if (e.key === "Enter") {
      // Example: send newline char if needed, or skip
      newBuffer += "\n";
    } else {
      // Ignore other keys (arrows, shift, etc)
      return;
    }

    bufferRef.current = newBuffer;
    setBuffer(newBuffer);

    // Schedule sending after debounce
    scheduleSend();
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="p-4">
      <label className="block text-sm font-medium text-gray-200 mb-1">
        Type to Send:
      </label>
      <div
        ref={inputRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="w-full min-h-[48px] p-2 rounded bg-gray-800 text-white border border-gray-600 focus:outline-none"
      >
        {buffer || <span className="text-gray-500">Start typing...</span>}
      </div>
    </div>
  );
}
