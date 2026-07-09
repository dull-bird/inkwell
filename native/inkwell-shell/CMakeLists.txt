cmake_minimum_required(VERSION 3.16)

project(inkwell_native_shell LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_AUTOMOC ON)

option(INKWELL_USE_BUNDLED_PDF4QT "Build shell against vendored PDF4QT GUI libraries." ON)
option(INKWELL_ENABLE_AGENT_WEBVIEW "Embed the React/ACP agent panel with Qt WebEngine." OFF)

set(
  INKWELL_PDF4QT_SOURCE_DIR
  "${CMAKE_CURRENT_LIST_DIR}/../vendor/pdf4qt"
  CACHE PATH
  "Path to the PDF4QT source tree."
)

if(NOT INKWELL_USE_BUNDLED_PDF4QT)
  message(FATAL_ERROR "inkwell-native-shell currently requires vendored PDF4QT. Enable INKWELL_USE_BUNDLED_PDF4QT.")
endif()

if(NOT EXISTS "${INKWELL_PDF4QT_SOURCE_DIR}/Pdf4QtLibGui/CMakeLists.txt")
  message(FATAL_ERROR "PDF4QT source tree not found at ${INKWELL_PDF4QT_SOURCE_DIR}. Run `git submodule update --init --recursive native/vendor/pdf4qt`.")
endif()

include(cmake/AddPdf4QtGui.cmake)
inkwell_add_pdf4qt_gui("${INKWELL_PDF4QT_SOURCE_DIR}")

find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets)

if(INKWELL_ENABLE_AGENT_WEBVIEW)
find_package(Qt6 REQUIRED COMPONENTS WebChannel WebEngineWidgets)
endif()

add_executable(inkwell-native-shell
    src/inkwell_agent_bridge.cpp
    src/inkwell_agent_bridge.h
    src/inkwell_pdf_bridge.cpp
    src/inkwell_pdf_bridge.h
    src/inkwell_main_window.cpp
    src/inkwell_main_window.h
    src/main.cpp
)

target_link_libraries(inkwell-native-shell
  PRIVATE
    Pdf4QtLibCore
    Pdf4QtLibWidgets
    Pdf4QtLibGui
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
)

if(INKWELL_ENABLE_AGENT_WEBVIEW)
target_compile_definitions(inkwell-native-shell PRIVATE INKWELL_ENABLE_AGENT_WEBVIEW=1)
target_link_libraries(inkwell-native-shell PRIVATE Qt6::WebChannel Qt6::WebEngineWidgets)
endif()

set_target_properties(inkwell-native-shell PROPERTIES
  WIN32_EXECUTABLE ON
  MACOSX_BUNDLE ON
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}"
)
