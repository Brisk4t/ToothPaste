#pragma once
#include <stdint.h>

/// @brief LRU manager for mapping transmitter labels to ATECC608B key storage slots. 
/// @details Stores data in NVS and manages eviction of old entries when capacity is exceeded.
class SlotManager {
public:
    static constexpr uint8_t INVALID_SLOT = 0xFF;
    static constexpr uint8_t LABEL_LEN = 12;
    static constexpr uint8_t CAPACITY = 8;

    // Physical ATECC slot numbers usable for ECC key storage — adjust to match chip config
    static constexpr uint8_t ATECC_SLOTS[CAPACITY] = { 0, 1, 2, 3, 4, 5, 6, 7 };

    SlotManager();
    void load();
    void save();

    // Returns ATECC slot for label, INVALID_SLOT if not found. Bumps LRU on hit.
    uint8_t lookup(const char* label);

    // Returns ATECC slot for label, allocating a free slot or evicting LRU.
    // out_is_new: set to true if a new slot was allocated (caller must call atcab_genkey)
    // evicted_label_out: if non-null, filled with the evicted label (LABEL_LEN+1 bytes) or '\0' if no eviction
    uint8_t assign(const char* label, bool* out_is_new = nullptr, char* evicted_label_out = nullptr);

    // Reserve a slot before the peer label is known (call at keypair generation time).
    // The slot is held in RAM only — not persisted — until commit() or release() is called.
    // Only one reservation can be active at a time; calling reserve() again returns the same slot.
    uint8_t reserve();

    // Finalize a pending reservation with the now-known label. Persists to NVS.
    // Returns the reserved slot, or INVALID_SLOT if no reservation is pending.
    uint8_t commit(const char* label, char* evicted_label_out = nullptr);

    // Cancel a pending reservation, freeing the slot. No NVS write.
    void release();

    void remove(const char* label);

private:
    struct Entry {
        char label[LABEL_LEN + 1];  // label[0] == '\0' means free
        uint8_t slot;
        uint32_t seq;
    };

    Entry entries_[CAPACITY];
    uint32_t counter_;
    int pending_idx_;  // index chosen by reserve(), or -1

    int find_label(const char* label) const;
    int find_free() const;
    int find_lru()  const;
    int pick_slot_idx(char* evicted_label_out);
};
