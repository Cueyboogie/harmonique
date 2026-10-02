# Harmonique as an Audio Unit + VST3 plugin.
#
#   cmake -B build -G Xcode          (macOS; or omit -G for Makefiles / Ninja)
#   cmake --build build --config Release
#
# JUCE and QuickJS are downloaded on first configure. To use a JUCE you already have:
#   cmake -B build -DFETCHCONTENT_SOURCE_DIR_JUCE=/path/to/JUCE
#
# The plugin embeds dist/plugin/harmonique-engine.js and dist/plugin/harmonique-ui.html:
# run `npm run build` in the repo root after changing anything under engine/ or app/.

cmake_minimum_required(VERSION 3.22)

if(APPLE AND NOT CMAKE_OSX_ARCHITECTURES)
    set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "Universal binary (Apple silicon + Intel)")
endif()
set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "Oldest macOS supported")

project(Harmonique VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set_property(GLOBAL PROPERTY USE_FOLDERS YES)

option(HARMONIQUE_COPY_AFTER_BUILD "Install the plugins into your user plug-in folders after each build" ON)
option(HARMONIQUE_TESTS "Build the headless plugin test (harmonique_plugin_test)" OFF)

include(FetchContent)
FetchContent_Declare(juce
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 8.0.9
    GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(juce)

# QuickJS-ng: the small JavaScript engine that runs Harmonique's engine inside the plugin.
# (SOURCE_SUBDIR trick: download only, then add it without its command-line tools.)
FetchContent_Declare(quickjs
    GIT_REPOSITORY https://github.com/quickjs-ng/quickjs.git
    GIT_TAG v0.10.1
    GIT_SHALLOW TRUE
    SOURCE_SUBDIR do-not-add)
FetchContent_MakeAvailable(quickjs)
add_subdirectory(${quickjs_SOURCE_DIR} ${quickjs_BINARY_DIR} EXCLUDE_FROM_ALL)
set_target_properties(qjs PROPERTIES POSITION_INDEPENDENT_CODE ON)

# The engine + window, built from the TypeScript app by `npm run build`.
set(HARMONIQUE_DIST ${CMAKE_CURRENT_SOURCE_DIR}/../dist/plugin)
foreach(f harmonique-engine.js harmonique-ui.html)
    if(NOT EXISTS ${HARMONIQUE_DIST}/${f})
        message(FATAL_ERROR "Missing dist/plugin/${f}: run `npm install && npm run build` in the repo root first.")
    endif()
endforeach()
juce_add_binary_data(HarmoniqueWeb
    HEADER_NAME BinaryData.h
    NAMESPACE BinaryData
    SOURCES ${HARMONIQUE_DIST}/harmonique-engine.js ${HARMONIQUE_DIST}/harmonique-ui.html)
set_target_properties(HarmoniqueWeb PROPERTIES POSITION_INDEPENDENT_CODE ON)

set(HARMONIQUE_SOURCES
    Source/Engine.cpp
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp)

function(harmonique_setup target)
    target_sources(${target} PRIVATE ${HARMONIQUE_SOURCES})
    target_compile_definitions(${target} PUBLIC
        JUCE_WEB_BROWSER=1
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_DISPLAY_SPLASH_SCREEN=0
        $<$<PLATFORM_ID:Windows>:JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1>)
    target_link_libraries(${target}
        PRIVATE
            HarmoniqueWeb
            qjs
            juce::juce_audio_utils
            juce::juce_gui_extra
        PUBLIC
            juce::juce_recommended_config_flags
            juce::juce_recommended_lto_flags
            juce::juce_recommended_warning_flags)
endfunction()

set(HARMONIQUE_COMMON
    COMPANY_NAME "Oscillate Audioworks"
    COMPANY_WEBSITE "https://theavidobserver.com"
    PLUGIN_MANUFACTURER_CODE Oscl
    VERSION ${PROJECT_VERSION}
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT TRUE
    NEEDS_WEB_BROWSER TRUE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    COPY_PLUGIN_AFTER_BUILD ${HARMONIQUE_COPY_AFTER_BUILD})
if(WIN32)
    list(APPEND HARMONIQUE_COMMON NEEDS_WEBVIEW2 TRUE)
endif()

# 1) "Harmonique": an instrument with MIDI out (AU + VST3). Ableton Live, Bitwig, Reaper, Cubase, Studio One, FL Studio.
set(HARMONIQUE_FORMATS VST3)
if(APPLE)
    list(PREPEND HARMONIQUE_FORMATS AU)
endif()
juce_add_plugin(Harmonique
    ${HARMONIQUE_COMMON}
    PRODUCT_NAME "Harmonique"
    BUNDLE_ID com.oscillateaudioworks.harmonique
    PLUGIN_CODE Hrmq
    DESCRIPTION "Every key plays a chord that fits. Loops, Euclidean rhythms, scale notes."
    FORMATS ${HARMONIQUE_FORMATS}
    IS_SYNTH TRUE
    IS_MIDI_EFFECT FALSE
    AU_MAIN_TYPE kAudioUnitType_MusicDevice
    VST3_CATEGORIES Instrument Generator)
harmonique_setup(Harmonique)

# 2) "Harmonique MIDI FX": an AU MIDI effect for Logic Pro / GarageBand (Logic only takes MIDI from AU MIDI FX).
if(APPLE)
    juce_add_plugin(HarmoniqueMidiFX
        ${HARMONIQUE_COMMON}
        PRODUCT_NAME "Harmonique MIDI FX"
        BUNDLE_ID com.oscillateaudioworks.harmonique.midifx
        PLUGIN_CODE Hrmf
        DESCRIPTION "Every key plays a chord that fits. Loops, Euclidean rhythms, scale notes."
        FORMATS AU
        IS_SYNTH FALSE
        IS_MIDI_EFFECT TRUE
        AU_MAIN_TYPE kAudioUnitType_MIDIProcessor)
    harmonique_setup(HarmoniqueMidiFX)
endif()

# Headless test: the real processor + engine thread, driven in real time by a fake playhead.
#   cmake -B build -DHARMONIQUE_TESTS=ON && cmake --build build --target harmonique_plugin_test
if(HARMONIQUE_TESTS)
    juce_add_console_app(harmonique_plugin_test PRODUCT_NAME "harmonique_plugin_test" NEEDS_WEB_BROWSER TRUE)
    target_sources(harmonique_plugin_test PRIVATE ${HARMONIQUE_SOURCES} Tests/PluginTest.cpp)
    target_include_directories(harmonique_plugin_test PRIVATE Source)
    target_compile_definitions(harmonique_plugin_test PRIVATE
        JUCE_WEB_BROWSER=1 JUCE_USE_CURL=0
        JucePlugin_Name="Harmonique" JucePlugin_VersionString="test" JucePlugin_IsMidiEffect=0 JUCE_MODAL_LOOPS_PERMITTED=1)
    target_link_libraries(harmonique_plugin_test PRIVATE
        HarmoniqueWeb qjs juce::juce_audio_utils juce::juce_gui_extra
        juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)
endif()
