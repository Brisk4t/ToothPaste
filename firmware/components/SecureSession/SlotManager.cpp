#include "SlotManager.h"
#include <Preferences.h>
#include <string.h>
#include <esp_log.h>

static const char* TAG = "SLOTMGR";

constexpr uint8_t SlotManager::ATECC_SLOTS[SlotManager::CAPACITY];

SlotManager::SlotManager() : counter_(0), pending_idx_(-1) {
    memset(entries_, 0, sizeof(entries_));
}

// Load slot mapping and LRU counter from NVS
void SlotManager::load() {
    Preferences prefs;
    prefs.begin("slotmgr", true);
    counter_ = prefs.getUInt("counter", 0);
    size_t n = prefs.getBytesLength("entries");
    if (n == sizeof(entries_)) {
        prefs.getBytes("entries", entries_, sizeof(entries_));
    } 
    prefs.end();
}

void SlotManager::save() {
    Preferences prefs;
    prefs.begin("slotmgr", false);
    prefs.putUInt("counter", counter_);
    prefs.putBytes("entries", entries_, sizeof(entries_));
    prefs.end();
}

// Returns ATECC slot index for label, -1 if not found.
int SlotManager::find_label(const char* label) const {
    for (int i = 0; i < CAPACITY; i++)
        if (entries_[i].label[0] != '\0' &&
            strncmp(entries_[i].label, label, LABEL_LEN) == 0)
            return i;
    return -1;
}

int SlotManager::find_free() const {
    for (int i = 0; i < CAPACITY; i++)
        if (entries_[i].label[0] == '\0')
            return i;
    return -1;
}

int SlotManager::find_lru() const {
    int      best    = -1;
    uint32_t min_seq = UINT32_MAX;
    for (int i = 0; i < CAPACITY; i++)
        if (entries_[i].label[0] != '\0' && entries_[i].seq < min_seq) {
            min_seq = entries_[i].seq;
            best    = i;
        }
    return best;
}

// Picks an entry index to use for a new label: free slot first, then LRU.
// Fills evicted_label_out if an active entry is displaced.
int SlotManager::pick_slot_idx(char* evicted_label_out) {
    int i = find_free();
    if (i >= 0) return i;

    i = find_lru();
    if (i < 0) return -1;
    ESP_LOGW(TAG, "Evicting '%s' from ATECC slot %u", entries_[i].label, entries_[i].slot);
    if (evicted_label_out)
        strncpy(evicted_label_out, entries_[i].label, LABEL_LEN + 1);
    return i;
}

// Returns ATECC slot index for label, INVALID_SLOT if not found. Bumps LRU on hit.
uint8_t SlotManager::lookup(const char* label) {
    int i = find_label(label);
    if (i < 0) return INVALID_SLOT;
    entries_[i].seq = ++counter_;
    save();
    return entries_[i].slot;
}

uint8_t SlotManager::assign(const char* label, bool* out_is_new, char* evicted_label_out) {
    if (evicted_label_out) evicted_label_out[0] = '\0';

    int i = find_label(label);
    if (i >= 0) {
        entries_[i].seq = ++counter_;
        save();
        if (out_is_new) *out_is_new = false;
        return entries_[i].slot;
    }

    i = pick_slot_idx(evicted_label_out);
    if (i < 0) return INVALID_SLOT;

    strncpy(entries_[i].label, label, LABEL_LEN);
    entries_[i].label[LABEL_LEN] = '\0';
    entries_[i].slot = ATECC_SLOTS[i];
    entries_[i].seq  = ++counter_;
    save();

    if (out_is_new) *out_is_new = true;
    return entries_[i].slot;
}

// Reserve a slot before the peer label is known (call at keypair generation time).
// The slot is held in RAM only — not persisted — until commit() or release() is called.
// Only one reservation can be active at a time; calling reserve() again returns the same slot
uint8_t SlotManager::reserve() {
    if (pending_idx_ >= 0)
        return ATECC_SLOTS[pending_idx_];  // idempotent

    int i = pick_slot_idx(nullptr);
    if (i < 0) return INVALID_SLOT;

    pending_idx_ = i;
    ESP_LOGD(TAG, "Reserved ATECC slot %u", ATECC_SLOTS[i]);
    return ATECC_SLOTS[i];
}

// Finalize a pending reservation with the now-known label. Persists to NVS.
// Returns the reserved slot, or INVALID_SLOT if no reservation is pending.
uint8_t SlotManager::commit(const char* label, char* evicted_label_out) {
    if (evicted_label_out) evicted_label_out[0] = '\0';

    if (pending_idx_ < 0) {
        ESP_LOGW(TAG, "commit() called with no pending reservation");
        return INVALID_SLOT;
    }

    int i = pending_idx_;
    pending_idx_ = -1;

    // Capture evicted label now, before overwriting the entry
    if (evicted_label_out && entries_[i].label[0] != '\0')
        strncpy(evicted_label_out, entries_[i].label, LABEL_LEN + 1);

    strncpy(entries_[i].label, label, LABEL_LEN);
    entries_[i].label[LABEL_LEN] = '\0';
    entries_[i].slot = ATECC_SLOTS[i];
    entries_[i].seq  = ++counter_;
    save();

    ESP_LOGD(TAG, "Committed label='%s' to ATECC slot %u", label, entries_[i].slot);
    return entries_[i].slot;
}

// Cancel a pending reservation, freeing the slot. No NVS write.
void SlotManager::release() {
    if (pending_idx_ < 0) return;
    pending_idx_ = -1;
    ESP_LOGD(TAG, "Released pending reservation");
}

// Remove a label and free its slot. Persists to NVS.
void SlotManager::remove(const char* label) {
    int i = find_label(label);
    if (i >= 0) {
        memset(&entries_[i], 0, sizeof(Entry));
        save();
    }
}
