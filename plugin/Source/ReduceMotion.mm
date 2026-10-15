#import <AppKit/AppKit.h>

/** macOS System Settings → Accessibility → Display → Reduce motion: turns the screen flicker off. */
bool harmoniqueReduceMotion()
{
    return [[NSWorkspace sharedWorkspace] accessibilityDisplayShouldReduceMotion];
}
