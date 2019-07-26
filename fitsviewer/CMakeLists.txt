cmake_minimum_required(VERSION 3.1)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

set(CMAKE_CXX_FLAGS "-Wall -Wextra -Wno-reorder -Wno-unused-parameter -fpermissive")
set(CMAKE_CXX_FLAGS_DEBUG "-g -O")
set(CMAKE_CXX_FLAGS_RELEASE "-O3")

#if ( CMAKE_COMPILER_IS_GNUCC )
#   set(CMAKE_CXX_FLAGS  "${CMAKE_CXX_FLAGS} -Wall")
#endif()
#if ( MSVC )
#    set(CMAKE_CXX_FLAGS  "${CMAKE_CXX_FLAGS} /W4")
#endif()

project(fitsviewer)

set(THREADS_PREFER_PTHREAD_FLAG ON)

set(CMAKE_MODULE_PATH ${PROJECT_SOURCE_DIR}/cmake/modules)

set (CMAKE_CXX_STANDARD 11)

set(CMAKE_CXX_FLAGS_DEBUG "-g")
set(CMAKE_CXX_FLAGS_RELEASE "-O3")

find_package(PNG REQUIRED)
find_package(JPEG REQUIRED)

find_package(CFITSIO REQUIRED)
find_package(INDI 1.7 REQUIRED client)
find_package(ZLIB REQUIRED)
find_package(Threads REQUIRED)


include_directories( ${INDI_INCLUDE_DIR})

file(GLOB SHM_OPEN_ANON_FILES ${PROJECT_SOURCE_DIR}/shm_open_anon/*.c)
list(FILTER SHM_OPEN_ANON_FILES EXCLUDE REGEX "/test.*\.c$")

add_library(archive OBJECT
      TempDir.cpp
      ${SHM_OPEN_ANON_FILES}
      ChildProcess.cpp
      FitsFile.cpp
      Astrometry.cpp
      FixedSizeBitSet.cpp
      SharedCache.cpp
      SharedCacheServer.cpp
      CacheFileDesc.cpp
      Stream.cpp
      ChannelMode.cpp
      StarFinder.cpp
      StarField.cpp
      Messages.cpp
      RawContent.cpp
      Histogram.cpp
      LookupTable.cpp
      BitMask.cpp
      uuid.cpp
    )


#####################
#   fitsviewer.cgi  #
#####################

add_executable(fitsviewer.cgi $<TARGET_OBJECTS:archive>  fitsviewer.cpp)
target_include_directories(fitsviewer.cgi PUBLIC ${JPEG_INCLUDE_DIR} ${PNG_INCLUDE_DIR} ${CFITSIO_INCLUDE_DIR})
target_link_libraries (fitsviewer.cgi ${JPEG_LIBRARY} ${PNG_LIBRARY} ${CFITSIO_LIBRARIES} cgicc)


#####################
#     processor     #
#####################

add_executable(processor $<TARGET_OBJECTS:archive>  processor.cpp)
target_link_libraries (processor ${CFITSIO_LIBRARIES} cgicc)

#####################
#      streamer     #
#####################

add_executable(streamer $<TARGET_OBJECTS:archive>  streamer.cpp)
target_include_directories(streamer PUBLIC ${INDI_INCLUDE_DIR})
target_link_libraries (streamer ${INDI_LIBRARIES} ${CFITSIO_LIBRARIES} ${ZLIB_LIBRARIES} Threads::Threads cgicc)


#####################
#     unittests     #
#####################

file(GLOB TEST_FILES ${PROJECT_SOURCE_DIR}/test/*.cpp)

add_executable(unittests $<TARGET_OBJECTS:archive>  ${TEST_FILES})

target_link_libraries (unittests ${CFITSIO_LIBRARIES} cgicc)

