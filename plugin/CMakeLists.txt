# Harmonique Mini: native VST3 + Audio Unit plugin (JUCE 8, no web view).
#
#   cmake -S plugin -B plugin/build -DCMAKE_BUILD_TYPE=Release
#   cmake --build plugin/build --config Release
#
# JUCE is downloaded on first configure. To use a JUCE you already have:
#   -DFETCHCONTENT_SOURCE_DIR_JUCE=/path/to/JUCE

cmake_minimum_required(VERSION 3.22)

if(APPLE AND NOT CMAKE_OSX_ARCHITECTURES)
    set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "Universal binary (Apple silicon + Intel)")
endif()
set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "Oldest macOS supported")

project(HarmoniqueMini VERSION 0.2.0 LANGUAGES C CXX)
if(APPLE)
    enable_language(OBJCXX)
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set_property(GLOBAL PROPERTY USE_FOLDERS YES)

option(HARMONIQUE_COPY_AFTER_BUILD "Install the plugins into your user plug-in folders after each build" ON)
option(HARMONIQUE_TESTS "Build the engine golden test and the plugin test" OFF)

include(FetchContent)
FetchContent_Declare(juce
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 8.0.9
    GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(juce)

# Fonts: Barlow Semi Condensed, JetBrains Mono, Righteous (all SIL Open Font License, see Fonts/OFL-*.txt)
juce_add_binary_data(MiniFonts
    HEADER_NAME MiniFonts.h
    NAMESPACE MiniFonts
    SOURCES
        Fonts/BarlowSemiCondensed-Light.ttf
        Fonts/BarlowSemiCondensed-Regular.ttf
        Fonts/BarlowSemiCondensed-Medium.ttf
        Fonts/BarlowSemiCondensed-SemiBold.ttf
        Fonts/JetBrainsMono-Regular.ttf
        Fonts/JetBrainsMono-Medium.ttf
        Fonts/Righteous-Regular.ttf)
set_target_properties(MiniFonts PROPERTIES POSITION_INDEPENDENT_CODE ON)

set(HARMONIQUE_ENGINE Source/Music.cpp Source/ChordPlayer.cpp)
set(HARMONIQUE_SOURCES ${HARMONIQUE_ENGINE} Source/PluginProcessor.cpp Source/PluginEditor.cpp)
if(APPLE)
    list(APPEND HARMONIQUE_SOURCES Source/ReduceMotion.mm)
endif()

function(harmonique_setup target)
    target_sources(${target} PRIVATE ${HARMONIQUE_SOURCES})
    target_compile_definitions(${target} PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_DISPLAY_SPLASH_SCREEN=0)
    target_link_libraries(${target}
        PRIVATE
            MiniFonts
            juce::juce_audio_utils
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
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE     # Live's computer MIDI keyboard keeps the keys
    COPY_PLUGIN_AFTER_BUILD ${HARMONIQUE_COPY_AFTER_BUILD})

# "Harmonique Mini": an instrument that outputs MIDI (like Cthulhu / Scaler). In Live: on its own MIDI track,
# with the synth track set to MIDI From → Harmonique Mini.
set(HARMONIQUE_FORMATS VST3)
if(APPLE)
    list(PREPEND HARMONIQUE_FORMATS AU)
endif()
juce_add_plugin(HarmoniqueMini
    ${HARMONIQUE_COMMON}
    PRODUCT_NAME "Harmonique Mini"
    BUNDLE_ID com.oscillateaudioworks.harmoniquemini
    PLUGIN_CODE Hmni
    DESCRIPTION "Every key plays a chord that fits."
    FORMATS ${HARMONIQUE_FORMATS}
    IS_SYNTH TRUE
    IS_MIDI_EFFECT FALSE
    AU_MAIN_TYPE kAudioUnitType_MusicDevice
    VST3_CATEGORIES Instrument Generator)
harmonique_setup(HarmoniqueMini)

# "Harmonique Mini MIDI FX": the same, as an AU MIDI effect for Logic Pro's MIDI FX slot.
if(APPLE)
    juce_add_plugin(HarmoniqueMiniMidiFX
        ${HARMONIQUE_COMMON}
        PRODUCT_NAME "Harmonique Mini MIDI FX"
        BUNDLE_ID com.oscillateaudioworks.harmoniquemini.midifx
        PLUGIN_CODE Hmnf
        DESCRIPTION "Every key plays a chord that fits."
        FORMATS AU
        IS_SYNTH FALSE
        IS_MIDI_EFFECT TRUE
        AU_MAIN_TYPE kAudioUnitType_MIDIProcessor)
    harmonique_setup(HarmoniqueMiniMidiFX)
endif()

if(HARMONIQUE_TESTS)
    # C++ engine == TypeScript engine, every combination (golden data from scripts/golden-engine.ts)
    juce_add_console_app(harmonique_engine_test PRODUCT_NAME "harmonique_engine_test")
    target_sources(harmonique_engine_test PRIVATE Source/Music.cpp Tests/EngineGoldenTest.cpp)
    target_include_directories(harmonique_engine_test PRIVATE Source)
    target_compile_definitions(harmonique_engine_test PRIVATE JUCE_USE_CURL=0 JUCE_WEB_BROWSER=0)
    target_link_libraries(harmonique_engine_test PRIVATE juce::juce_core juce::juce_recommended_config_flags)

    # The processor + window, driven block by block like a host: note-off guarantees, humanize, state, UI clicks
    juce_add_console_app(harmonique_plugin_test PRODUCT_NAME "harmonique_plugin_test")
    target_sources(harmonique_plugin_test PRIVATE ${HARMONIQUE_SOURCES} Tests/PluginTest.cpp)
    target_include_directories(harmonique_plugin_test PRIVATE Source)
    target_compile_definitions(harmonique_plugin_test PRIVATE
        JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_MODAL_LOOPS_PERMITTED=1
        JucePlugin_Name="Harmonique Mini" JucePlugin_IsMidiEffect=0)
    target_link_libraries(harmonique_plugin_test PRIVATE
        MiniFonts juce::juce_audio_utils juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)
endif()
