cmake_minimum_required(VERSION 3.1)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

if ( CMAKE_COMPILER_IS_GNUCC )
    set(CMAKE_CXX_FLAGS  "${CMAKE_CXX_FLAGS} -Wall")
endif()
if ( MSVC )
    set(CMAKE_CXX_FLAGS  "${CMAKE_CXX_FLAGS} /W4")
endif()

project(fitsviewer)


set(CMAKE_MODULE_PATH ${PROJECT_SOURCE_DIR}/cmake/modules)

set (CMAKE_CXX_STANDARD 11)

set(CMAKE_CXX_FLAGS_DEBUG "-g")
set(CMAKE_CXX_FLAGS_RELEASE "-O3")

set(SRCS
	SharedCache.cpp
	SharedCacheServer.cpp
	Messages.cpp
	RawContent.cpp
	Histogram.cpp
	LookupTable.cpp
  BitMask.cpp
    )

add_executable(fitsviewer.cgi ${SRCS} fitsviewer.cpp)
add_executable(starfinder.cgi ${SRCS} starfinder.cpp)

file(GLOB TEST_FILES ${PROJECT_SOURCE_DIR}/test/*.cpp)

add_executable(unittests ${SRCS} ${TEST_FILES})

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
  target_link_libraries (starfinder.cgi ${CFITSIO_LIBRARIES})
  target_link_libraries (unittests ${CFITSIO_LIBRARIES})
else ()
  # Sinon, nous affichons un message
  message(FATAL_ERROR "libcfitsio not found")
endif ()

target_link_libraries (fitsviewer.cgi cgicc)
target_link_libraries (starfinder.cgi cgicc)
target_link_libraries (unittests cgicc)