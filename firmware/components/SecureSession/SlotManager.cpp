#include "SlotManager.h"
#include <Preferences.h>
#include <string.h>
#include <esp_log.h>

static const char* TAG = "SLOTMGR";

constexpr uint8_t SlotManager::ATECC_SLOTS[SlotManager::CAPACITY];

SlotManager::SlotManager() : counter_(0) {
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

// Save current slot mapping and LRU counter to NVS
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

// Find a free slot (label[0] == '\0'), or return -1 if none are free
int SlotManager::find_free() const {
    for (int i = 0; i < CAPACITY; i++)
        if (entries_[i].label[0] == '\0')
            return i;
    return -1;
}

// Find the slot with the lowest sequence number (least recently used)
int SlotManager::find_lru() const {
    int best = -1;
    uint32_t min_seq = UINT32_MAX;
    for (int i = 0; i < CAPACITY; i++)
        if (entries_[i].label[0] != '\0' && entries_[i].seq < min_seq) {
            min_seq = entries_[i].seq;
            best = i;
        }
    return best;
}

// Returns ATECC slot index for label, INVALID_SLOT if not found. Bumps LRU on hit.
uint8_t SlotManager::lookup(const char* label) {
    int i = find_label(label);
    if (i < 0) return INVALID_SLOT;
    entries_[i].seq = ++counter_;
    save();
    return entries_[i].slot;
}

// Returns ATECC slot index for label, allocating a free slot or evicting LRU.
uint8_t SlotManager::assign(const char* label, bool* out_is_new, char* evicted_label_out) {
    if (evicted_label_out) {
        evicted_label_out[0] = '\0';
    }

    int i = find_label(label);
    if (i >= 0) {
        entries_[i].seq = ++counter_;
        save();
        if (out_is_new) *out_is_new = false;
        return entries_[i].slot;
    }

    i = find_free();
    if (i < 0) {
        i = find_lru();
        if (i < 0) return INVALID_SLOT;
        ESP_LOGW(TAG, "Evicting '%s' from ATECC slot %u", entries_[i].label, entries_[i].slot);
        if (evicted_label_out)
            strncpy(evicted_label_out, entries_[i].label, LABEL_LEN + 1);
    }

    strncpy(entries_[i].label, label, LABEL_LEN);
    entries_[i].label[LABEL_LEN] = '\0';
    entries_[i].slot = ATECC_SLOTS[i];
    entries_[i].seq = ++counter_;
    save();

    if (out_is_new) *out_is_new = true;
    return entries_[i].slot;
}

// Deletes the entry for the given label, if it exists, and frees the associated ATECC slot.
void SlotManager::remove(const char* label) {
    int i = find_label(label);
    if (i >= 0) {
        memset(&entries_[i], 0, sizeof(Entry));
        save();
    }
}
