#pragma once

// Sets esp_log_level_set() for every known TAG according to the active build mode.
// The mode is selected at the top of log_config.cpp — change it there, recompile that
// file only (no CMake reconfigure, no full rebuild required).
void configure_log_levels();
