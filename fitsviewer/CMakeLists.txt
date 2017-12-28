cmake_minimum_required(VERSION 3.1)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

project(fitsviewer)


set(CMAKE_MODULE_PATH ${PROJECT_SOURCE_DIR}/cmake/modules)

set (CMAKE_CXX_STANDARD 11)

set(CMAKE_CXX_FLAGS_DEBUG "-g")
set(CMAKE_CXX_FLAGS_RELEASE "-O3")

set(SRCS
	fitsviewer.cpp
	SharedCache.cpp
	Messages.cpp
    )

add_executable(fitsviewer.cgi ${SRCS})

find_package (PNG)

if (PNG_FOUND)
  target_include_directories(fitsviewer.cgi PUBLIC ${PNG_INCLUDE_DIR})
  target_link_libraries (fitsviewer.cgi ${PNG_LIBRARY})
else ()
  # Sinon, nous affichons un message
  message(FATAL_ERROR "libpng not found")
endif ()

find_package(JPEG)
if (JPEG_FOUND)
  target_include_directories(fitsviewer.cgi PUBLIC ${JPEG_INCLUDE_DIR})
  target_link_libraries (fitsviewer.cgi ${JPEG_LIBRARY})
else ()
  # Sinon, nous affichons un message
  message(FATAL_ERROR "libjpeg not found")
endif ()


find_package(CFITSIO)

if (CFITSIO_FOUND)
  target_include_directories(fitsviewer.cgi PUBLIC ${CFITSIO_INCLUDE_DIR})
  target_link_libraries (fitsviewer.cgi ${CFITSIO_LIBRARIES})
else ()
  # Sinon, nous affichons un message
  message(FATAL_ERROR "libcfitsio not found")
endif ()
	
target_link_libraries (fitsviewer.cgi cgicc)