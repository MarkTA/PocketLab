# Distributed under the OSI-approved BSD 3-Clause License.  See accompanying
# file LICENSE.rst or https://cmake.org/licensing for details.

cmake_minimum_required(VERSION ${CMAKE_VERSION}) # this file comes with cmake

# If CMAKE_DISABLE_SOURCE_CHANGES is set to true and the source directory is an
# existing directory in our source tree, calling file(MAKE_DIRECTORY) on it
# would cause a fatal error, even though it would be a no-op.
if(NOT EXISTS "C:/Users/mark/Desktop/PocketLab/firmware_nrf52")
  file(MAKE_DIRECTORY "C:/Users/mark/Desktop/PocketLab/firmware_nrf52")
endif()
file(MAKE_DIRECTORY
  "C:/Users/mark/Desktop/PocketLab/firmware_nrf52/build/firmware_nrf52"
  "C:/Users/mark/Desktop/PocketLab/firmware_nrf52/build/_sysbuild/sysbuild/images/firmware_nrf52-prefix"
  "C:/Users/mark/Desktop/PocketLab/firmware_nrf52/build/_sysbuild/sysbuild/images/firmware_nrf52-prefix/tmp"
  "C:/Users/mark/Desktop/PocketLab/firmware_nrf52/build/_sysbuild/sysbuild/images/firmware_nrf52-prefix/src/firmware_nrf52-stamp"
  "C:/Users/mark/Desktop/PocketLab/firmware_nrf52/build/_sysbuild/sysbuild/images/firmware_nrf52-prefix/src"
  "C:/Users/mark/Desktop/PocketLab/firmware_nrf52/build/_sysbuild/sysbuild/images/firmware_nrf52-prefix/src/firmware_nrf52-stamp"
)

set(configSubDirs )
foreach(subDir IN LISTS configSubDirs)
    file(MAKE_DIRECTORY "C:/Users/mark/Desktop/PocketLab/firmware_nrf52/build/_sysbuild/sysbuild/images/firmware_nrf52-prefix/src/firmware_nrf52-stamp/${subDir}")
endforeach()
if(cfgdir)
  file(MAKE_DIRECTORY "C:/Users/mark/Desktop/PocketLab/firmware_nrf52/build/_sysbuild/sysbuild/images/firmware_nrf52-prefix/src/firmware_nrf52-stamp${cfgdir}") # cfgdir has leading slash
endif()
