cmake_minimum_required(VERSION 3.16.0)

# Windows has a ~32767-char command-line limit. Move all -I flags into a
# response file so the compiler is invoked as: gcc @includes.rsp ... src.c
set(CMAKE_C_USE_RESPONSE_FILE_FOR_INCLUDES ON)
set(CMAKE_CXX_USE_RESPONSE_FILE_FOR_INCLUDES ON)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(ToothPaste)

# GCC ICE (internal compiler error in IRA pass) triggered by esp-dsp float
# convolution code at -O2.  Drop that one file to -O1 as a workaround.
set_source_files_properties(
    "${CMAKE_CURRENT_SOURCE_DIR}/managed_components/espressif__esp-dsp/modules/conv/float/dspi_conv_f32_ansi.c"
    PROPERTIES COMPILE_FLAGS "-O1"
)
