function(inkwell_add_pdf4qt_core PDF4QT_ROOT)
  set(PDF4QT_VERSION 1.6.0.0)
  set(PDF4QT_BUILD_ONLY_CORE_LIBRARY ON CACHE BOOL "Build only the PDF4QT core library." FORCE)
  set(PDF4QT_BUILD_TESTS OFF CACHE BOOL "Build PDF4QT upstream tests." FORCE)
  set(PDF4QT_INSTALL_INCLUDE OFF CACHE BOOL "Install PDF4QT headers." FORCE)
  set(PDF4QT_INSTALL_DEPENDENCIES OFF CACHE BOOL "Install PDF4QT runtime dependencies." FORCE)
  set(PDF4QT_INSTALL_QT_DEPENDENCIES OFF CACHE BOOL "Install Qt runtime dependencies." FORCE)

  add_compile_definitions(PDF4QT_PROJECT_VERSION="${PDF4QT_VERSION}" QT_NO_EMIT)

  find_package(Qt6 REQUIRED COMPONENTS Core Gui Svg Xml)
  find_package(OpenSSL REQUIRED)
  find_package(ZLIB REQUIRED)
  find_package(Freetype REQUIRED)
  find_package(OpenJPEG CONFIG REQUIRED)
  find_package(JPEG REQUIRED)
  find_package(PNG REQUIRED)
  find_package(blend2d CONFIG REQUIRED)

  find_library(LCMS2_LIBRARIES lcms2 REQUIRED)

  if(UNIX AND NOT APPLE AND CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
    set(LINUX_GCC ON CACHE BOOL "PDF4QT Linux GCC build." FORCE)
    find_package(TBB REQUIRED)
  endif()

  include(GNUInstallDirs)
  include(GenerateExportHeader)

  set(CMAKE_AUTOMOC ON)
  set(CMAKE_AUTORCC ON)
  set(CMAKE_AUTOUIC ON)

  set(INSTALL_INCLUDEDIR "${CMAKE_INSTALL_INCLUDEDIR}" CACHE STRING "PDF4QT generated include dir." FORCE)
  set(PDF4QT_INSTALL_BIN_DIR "${CMAKE_INSTALL_BINDIR}" CACHE STRING "PDF4QT binary output dir." FORCE)
  set(PDF4QT_INSTALL_LIB_DIR "${CMAKE_INSTALL_LIBDIR}" CACHE STRING "PDF4QT library output dir." FORCE)
  set(PDF4QT_PLUGINS_RELATIVE_PATH "." CACHE STRING "PDF4QT plugin path relative to native host." FORCE)
  set(PDF4QT_TRANSLATIONS_RELATIVE_PATH "translations" CACHE STRING "PDF4QT translation path relative to native host." FORCE)

  configure_file("${PDF4QT_ROOT}/config.h.cmake" "${CMAKE_BINARY_DIR}/config.h")

  add_subdirectory("${PDF4QT_ROOT}/Pdf4QtLibCore" "${CMAKE_BINARY_DIR}/pdf4qt/Pdf4QtLibCore" EXCLUDE_FROM_ALL)
  target_include_directories(Pdf4QtLibCore PRIVATE "${CMAKE_BINARY_DIR}")

  find_path(
    INKWELL_OPENJPEG_INCLUDE_DIR
    openjpeg.h
    PATH_SUFFIXES
      openjpeg-2.5
      openjpeg-2.4
      openjpeg-2.3
      openjpeg-2.2
      openjpeg-2.1
  )
  if(INKWELL_OPENJPEG_INCLUDE_DIR)
    target_include_directories(Pdf4QtLibCore PRIVATE "${INKWELL_OPENJPEG_INCLUDE_DIR}")
  endif()
endfunction()
