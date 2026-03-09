/**
 * FIFO queue for managing asynchronous packet production and consumption
 * Allows producers to enqueue packets while consumers wait asynchronously
 */
export class PacketQueue {
    constructor() {
        this.queue = [];
        this.waiters = [];
        this.finished = false;
    }

    /**
     * Enqueue a packet and wake up waiting consumers
     * @param {*} packet - The packet to enqueue
     */
    enqueue(packet) {
        this.queue.push(packet);
        // Wake up any waiting consumers
        if (this.waiters.length > 0) {
            const resolve = this.waiters.shift();
            resolve();
        }
    }

    /**
     * Dequeue a packet, waiting if necessary
     * Returns null when finished and queue is empty
     * @returns {Promise<*>} The next packet or null when done
     */
    async dequeue() {
        // If queue has packets, return immediately
        if (this.queue.length > 0) {
            return this.queue.shift();
        }
        
        // If no packets and producer is done, return null to signal end
        if (this.finished) {
            return null;
        }
        
        // Wait for next packet
        await new Promise(resolve => this.waiters.push(resolve));
        
        if (this.queue.length > 0) {
            return this.queue.shift();
        }
        
        return this.finished ? null : await this.dequeue();
    }

    /**
     * Signal that no more packets will be produced
     * Wakes up all waiting consumers
     */
    finish() {
        this.finished = true;
        // Wake up all waiting consumers
        while (this.waiters.length > 0) {
            const resolve = this.waiters.shift();
            resolve();
        }
    }
}
