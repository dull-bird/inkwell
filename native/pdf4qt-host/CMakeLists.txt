cmake_minimum_required(VERSION 3.21)

project(inkwell_pdf4qt_host LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Qt6 REQUIRED COMPONENTS Core)

add_executable(inkwell-pdf4qt-host
  src/main.cpp
)

target_link_libraries(inkwell-pdf4qt-host
  PRIVATE
    Qt6::Core
)

install(TARGETS inkwell-pdf4qt-host
  RUNTIME DESTINATION .
  BUNDLE DESTINATION .
)
