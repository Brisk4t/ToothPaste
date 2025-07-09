import React, { useEffect, useRef, useState, useContext, useCallback } from "react";
import { ECDHContext } from '../context/ECDHContext';
import { BLEContext } from '../context/BLEContext';

// Async queue utility
function createAsyncQueue() {
  const queue = [];
  let resolvers = [];

  const push = (item) => {
    if (resolvers.length > 0) {
      const resolve = resolvers.shift();
      resolve(item);  // resolve with the item itself, not {value, done}
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
  const [input, setInput] = useState("");
  const queueRef = useRef( createAsyncQueue());
  const processingRef = useRef(false);
  const { pktCharacteristic, status, readyToReceive } = useContext(BLEContext);
  const { createEncryptedPackets } = useContext(ECDHContext);

  const waitForReady = useCallback(() => {
    if (!readyToReceive.current.promise) {
      readyToReceive.current.promise = new Promise((resolve) => {
        readyToReceive.current.resolve = resolve;
      });
    }
    return readyToReceive.current.promise;
  }, [readyToReceive]);

  useEffect(() => {

    const processQueue = async () => {
      console.log("Starting to process queue...");
      for await (const char of queueRef.current.iterator) {
        console.log("Got char from queue:", char);
        for await (const packet of createEncryptedPackets(0, char)) {
          console.log("Sending packet:", char);
          await pktCharacteristic.writeValueWithoutResponse(packet.serialize());

          // Setup the promise
          waitForReady();
          await readyToReceive.current.promise;
        }
      }
    };

    if (!processingRef.current) {
      processingRef.current = true;
      processQueue();
    }
  }, [pktCharacteristic, waitForReady, readyToReceive]);

  const handleChange = (e) => {
    const newValue = e.target.value; // The full string
    const lastChar = newValue.slice(-1); // The last char of the full string
    setInput(newValue);
    
    if (queueRef.current && lastChar) {
      queueRef.current.push(lastChar);
    } else {
      console.warn("Queue not ready yet or no char:", queueRef.current, lastChar);
    }
  };

  return (
    <div className="p-4">
      <label className="block text-sm font-medium text-gray-200 mb-1">
        Type to Send:
      </label>
      <input
        type="text"
        value={input}
        onChange={handleChange}
        className="w-full p-2 rounded bg-gray-800 text-white border border-gray-600"
        placeholder="Start typing..."
      />
    </div>
  );
}
