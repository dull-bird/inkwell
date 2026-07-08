cmake_minimum_required(VERSION 3.16)

project(inkwell_pdf4qt_host LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(INKWELL_USE_BUNDLED_PDF4QT "Build the host with the vendored PDF4QT core adapter." OFF)
set(
  INKWELL_PDF4QT_SOURCE_DIR
  "${CMAKE_CURRENT_LIST_DIR}/../vendor/pdf4qt"
  CACHE PATH
  "Path to the PDF4QT source tree."
)

find_package(Qt6 REQUIRED COMPONENTS Core)

add_executable(inkwell-pdf4qt-host
  src/pdf4qt_adapter.cpp
  src/pdf4qt_adapter.h
  src/main.cpp
)

target_link_libraries(inkwell-pdf4qt-host
  PRIVATE
    Qt6::Core
)

target_compile_definitions(inkwell-pdf4qt-host
  PRIVATE
    INKWELL_PDF4QT_SOURCE_DIR="${INKWELL_PDF4QT_SOURCE_DIR}"
)

if(INKWELL_USE_BUNDLED_PDF4QT)
  if(NOT EXISTS "${INKWELL_PDF4QT_SOURCE_DIR}/Pdf4QtLibCore/CMakeLists.txt")
    message(FATAL_ERROR "PDF4QT source tree not found at ${INKWELL_PDF4QT_SOURCE_DIR}. Run `git submodule update --init --recursive native/vendor/pdf4qt`.")
  endif()

  include(cmake/AddPdf4QtCore.cmake)
  inkwell_add_pdf4qt_core("${INKWELL_PDF4QT_SOURCE_DIR}")

  target_link_libraries(inkwell-pdf4qt-host
    PRIVATE
      Pdf4QtLibCore
      Qt6::Gui
      Qt6::Svg
      Qt6::Xml
  )
  target_compile_definitions(inkwell-pdf4qt-host PRIVATE INKWELL_ENABLE_PDF4QT_ADAPTER=1)
endif()

install(TARGETS inkwell-pdf4qt-host
  RUNTIME DESTINATION .
  BUNDLE DESTINATION .
)
