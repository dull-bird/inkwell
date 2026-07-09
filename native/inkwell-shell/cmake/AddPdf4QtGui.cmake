function(inkwell_patch_pdf4qt_std_execution PDF4QT_ROOT)
  set(_execution_policy_header
      "${PDF4QT_ROOT}/Pdf4QtLibCore/sources/pdfexecutionpolicy.h")
  set(_visitor_header
      "${PDF4QT_ROOT}/Pdf4QtLibCore/sources/pdfvisitor.h")

  if(NOT EXISTS "${_execution_policy_header}")
    message(FATAL_ERROR "PDF4QT execution policy header not found at ${_execution_policy_header}.")
  endif()
  if(NOT EXISTS "${_visitor_header}")
    message(FATAL_ERROR "PDF4QT visitor header not found at ${_visitor_header}.")
  endif()

  file(READ "${_execution_policy_header}" _execution_policy_source)
  set(_patched_execution_policy_source "${_execution_policy_source}")

  string(
    REPLACE
      "std::for_each(std::execution::seq, first, last, f);"
      "std::for_each(first, last, f);"
      _patched_execution_policy_source
      "${_patched_execution_policy_source}"
  )
  string(
    REPLACE
      "std::sort(std::execution::seq, first, last, f);"
      "std::sort(first, last, f);"
      _patched_execution_policy_source
      "${_patched_execution_policy_source}"
  )

  if(NOT _patched_execution_policy_source STREQUAL _execution_policy_source)
    file(WRITE "${_execution_policy_header}" "${_patched_execution_policy_source}")
    message(STATUS "Applied PDF4QT libc++ sequential algorithm compatibility patch.")
  endif()

  file(READ "${_visitor_header}" _visitor_source)
  set(_patched_visitor_source "${_visitor_source}")

  string(
    REPLACE
      "std::for_each(std::execution::par, objects.cbegin(), objects.cend(), [visitor](const PDFObjectStorage::Entry& entry) { entry.object.accept(visitor); });"
      "std::for_each(objects.cbegin(), objects.cend(), [visitor](const PDFObjectStorage::Entry& entry) { entry.object.accept(visitor); });"
      _patched_visitor_source
      "${_patched_visitor_source}"
  )
  string(
    REPLACE
      "std::for_each(std::execution::par, objects.cbegin(), objects.cend(), process);"
      "std::for_each(objects.cbegin(), objects.cend(), process);"
      _patched_visitor_source
      "${_patched_visitor_source}"
  )
  string(
    REPLACE
      "std::for_each(std::execution::seq, objects.cbegin(), objects.cend(), [visitor](const PDFObjectStorage::Entry& entry) { entry.object.accept(visitor); });"
      "std::for_each(objects.cbegin(), objects.cend(), [visitor](const PDFObjectStorage::Entry& entry) { entry.object.accept(visitor); });"
      _patched_visitor_source
      "${_patched_visitor_source}"
  )

  if(NOT _patched_visitor_source STREQUAL _visitor_source)
    file(WRITE "${_visitor_header}" "${_patched_visitor_source}")
    message(STATUS "Applied PDF4QT libc++ visitor traversal compatibility patch.")
  endif()
endfunction()

function(inkwell_add_pdf4qt_gui PDF4QT_ROOT)
  inkwell_patch_pdf4qt_std_execution("${PDF4QT_ROOT}")

  set(PDF4QT_VERSION 1.6.0.0)
  set(PDF4QT_BUILD_ONLY_CORE_LIBRARY OFF CACHE BOOL "Build PDF4QT GUI libraries." FORCE)
  set(PDF4QT_BUILD_TESTS OFF CACHE BOOL "Build PDF4QT upstream tests." FORCE)
  set(PDF4QT_INSTALL_INCLUDE OFF CACHE BOOL "Install PDF4QT headers." FORCE)
  set(PDF4QT_INSTALL_DEPENDENCIES OFF CACHE BOOL "Install PDF4QT runtime dependencies." FORCE)
  set(PDF4QT_INSTALL_QT_DEPENDENCIES OFF CACHE BOOL "Install Qt runtime dependencies." FORCE)

  add_compile_definitions(PDF4QT_PROJECT_VERSION="${PDF4QT_VERSION}" QT_NO_EMIT)

  find_package(Qt6Core CONFIG REQUIRED)
  find_package(Qt6Gui CONFIG REQUIRED)
  find_package(Qt6Svg CONFIG REQUIRED)
  find_package(Qt6Xml CONFIG REQUIRED)
  find_package(Qt6Widgets CONFIG REQUIRED)
  find_package(Qt6PrintSupport CONFIG REQUIRED)
  find_package(Qt6Multimedia CONFIG REQUIRED)
  find_package(Qt6TextToSpeech CONFIG REQUIRED)
  find_package(OpenSSL REQUIRED)
  find_package(ZLIB REQUIRED)
  find_package(Freetype REQUIRED)
  find_package(Fontconfig REQUIRED)
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
  set(QT6_INSTALL_PREFIX "${Qt6_DIR}/../../.." CACHE STRING "Qt6 install prefix used by PDF4QT." FORCE)
  set(PDF4QT_PLUGINS_RELATIVE_PATH "../${PDF4QT_INSTALL_LIB_DIR}/pdfplugins")
  set(PDF4QT_TRANSLATIONS_RELATIVE_PATH "translations")

  configure_file("${PDF4QT_ROOT}/config.h.cmake" "${CMAKE_BINARY_DIR}/config.h" @ONLY)

  add_subdirectory("${PDF4QT_ROOT}/Pdf4QtLibCore" "${CMAKE_BINARY_DIR}/pdf4qt/Pdf4QtLibCore")
  add_subdirectory("${PDF4QT_ROOT}/Pdf4QtLibWidgets" "${CMAKE_BINARY_DIR}/pdf4qt/Pdf4QtLibWidgets")
  add_subdirectory("${PDF4QT_ROOT}/Pdf4QtLibGui" "${CMAKE_BINARY_DIR}/pdf4qt/Pdf4QtLibGui")

  target_include_directories(Pdf4QtLibCore PRIVATE "${CMAKE_BINARY_DIR}")
  target_include_directories(Pdf4QtLibGui PRIVATE "${CMAKE_BINARY_DIR}")
  target_link_libraries(Pdf4QtLibCore PRIVATE Fontconfig::Fontconfig)
endfunction()
