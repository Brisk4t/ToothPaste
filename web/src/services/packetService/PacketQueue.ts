/**
 * FIFO queue for managing asynchronous packet production and consumption
 * Allows producers to enqueue packets while consumers wait asynchronously
 */
export class PacketQueue<T> {
    private queue: T[] = [];
    private waiters: Array<() => void> = [];
    private finished = false;

    /**
     * Enqueue a packet and wake up waiting consumers
     */
    enqueue(packet: T): void {
        this.queue.push(packet);
        // Wake up any waiting consumers
        if (this.waiters.length > 0) {
            const resolve = this.waiters.shift();
            resolve?.();
        }
    }

    /**
     * Dequeue a packet, waiting if necessary
     * Returns null when finished and queue is empty
     */
    async dequeue(): Promise<T | null> {
        // If queue has packets, return immediately
        if (this.queue.length > 0) {
            return this.queue.shift() as T;
        }

        // If no packets and producer is done, return null to signal end
        if (this.finished) {
            return null;
        }

        // Wait for next packet
        await new Promise<void>(resolve => this.waiters.push(resolve));

        if (this.queue.length > 0) {
            return this.queue.shift() as T;
        }

        return this.finished ? null : await this.dequeue();
    }

    /**
     * Signal that no more packets will be produced
     * Wakes up all waiting consumers
     */
    finish(): void {
        this.finished = true;
        // Wake up all waiting consumers
        while (this.waiters.length > 0) {
            const resolve = this.waiters.shift();
            resolve?.();
        }
    }
}
