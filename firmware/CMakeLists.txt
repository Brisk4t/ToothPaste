cmake_minimum_required(VERSION 3.16.0)

# Windows has a ~32767-char command-line limit. Move all -I flags into a
# response file so the compiler is invoked as: gcc @includes.rsp ... src.c
set(CMAKE_C_USE_RESPONSE_FILE_FOR_INCLUDES ON)
set(CMAKE_CXX_USE_RESPONSE_FILE_FOR_INCLUDES ON)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(ToothPaste)
