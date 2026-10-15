#include "PluginEditor.h"
#include "LogoPath.h"
#include <MiniFonts.h>

using namespace hq;
using Hit = HarmoniqueEditor::Hit;

#if JUCE_MAC
bool harmoniqueReduceMotion();          // ReduceMotion.mm: macOS "Reduce motion"
#else
static bool harmoniqueReduceMotion() { return false; }
#endif

namespace
{
    constexpr float W = 900, H = 420;
    // content box: screen (inset 14) + padding 16 top, 24 sides, 14 bottom
    constexpr float X0 = 38, X1 = 862, Y0 = 30, Y1 = 392;

    struct Theme { const char* name; juce::uint32 p, bg; };
    constexpr Theme themes[4] = {
        { "AMBER", 0xffff9e2c, 0xff160a03 },
        { "TEAL",  0xff47a8bd, 0xff04100f },
        { "ROSE",  0xffc2847a, 0xff140807 },
        { "CREAM", 0xffeee0cb, 0xff12100c },
    };

    //==============================================================================
    // Fonts (embedded): Barlow Semi Condensed 300/400/500/600, JetBrains Mono 400/500, Righteous
    struct Faces
    {
        juce::Typeface::Ptr cond300, cond400, cond500, cond600, mono400, mono500, word;
        static const Faces& get()
        {
            static const Faces f;
            return f;
        }
    private:
        static juce::Typeface::Ptr load (const char* data, int size) { return juce::Typeface::createSystemTypefaceFor (data, (size_t) size); }
        Faces()
          : cond300 (load (MiniFonts::BarlowSemiCondensedLight_ttf,    MiniFonts::BarlowSemiCondensedLight_ttfSize)),
            cond400 (load (MiniFonts::BarlowSemiCondensedRegular_ttf,  MiniFonts::BarlowSemiCondensedRegular_ttfSize)),
            cond500 (load (MiniFonts::BarlowSemiCondensedMedium_ttf,   MiniFonts::BarlowSemiCondensedMedium_ttfSize)),
            cond600 (load (MiniFonts::BarlowSemiCondensedSemiBold_ttf, MiniFonts::BarlowSemiCondensedSemiBold_ttfSize)),
            mono400 (load (MiniFonts::JetBrainsMonoRegular_ttf,        MiniFonts::JetBrainsMonoRegular_ttfSize)),
            mono500 (load (MiniFonts::JetBrainsMonoMedium_ttf,         MiniFonts::JetBrainsMonoMedium_ttfSize)),
            word    (load (MiniFonts::RighteousRegular_ttf,            MiniFonts::RighteousRegular_ttfSize)) {}
    };

    /** A text style: face, CSS px size, CSS letter-spacing in em. */
    struct Style
    {
        juce::Typeface::Ptr face;
        float px;
        float tracking = 0.0f;
        bool fallback = true;    // draw ♭ ♯ ▸ ◂ → with JetBrains Mono (Barlow and Righteous don't have them)
    };

    Style cond (int weight, float px, float tracking = 0.0f)
    {
        const auto& f = Faces::get();
        return { weight <= 300 ? f.cond300 : weight <= 400 ? f.cond400 : weight <= 500 ? f.cond500 : f.cond600, px, tracking };
    }
    Style mono (int weight, float px, float tracking = 0.0f)
    {
        const auto& f = Faces::get();
        return { weight <= 400 ? f.mono400 : f.mono500, px, tracking, false };
    }

    juce::Font fontOf (const juce::Typeface::Ptr& face, float px) { return juce::Font (juce::FontOptions (face).withPointHeight (px)); }

    bool needsFallback (juce::juce_wchar c)
    {
        return c == 0x266D || c == 0x266F || c == 0x25B8 || c == 0x25C2 || c == 0x2192 || c == 0x1D12B || c == 0x1D12A;
    }

    /** Lays out `text` from x on `baseline`; returns the glyphs and the advance (CSS: letter-spacing after every character). */
    juce::GlyphArrangement layout (const juce::String& text, const Style& st, float x, float baseline, float& advance)
    {
        juce::GlyphArrangement out;
        float pen = x;
        const float track = st.tracking * st.px;
        auto t = text.getCharPointer();
        while (! t.isEmpty())
        {
            const auto c = t.getAndAdvance();
            const bool fb = st.fallback && needsFallback (c);
            const auto font = fontOf (fb ? Faces::get().mono400 : st.face, fb ? st.px * 0.92f : st.px);
            juce::GlyphArrangement ga;
            ga.addLineOfText (font, juce::String::charToString (c), pen, baseline);
            const float w = juce::GlyphArrangement::getStringWidth (font, juce::String::charToString (c));
            out.addGlyphArrangement (ga);
            pen += w + track;
        }
        advance = pen - x;
        return out;
    }

    float textWidth (const juce::String& text, const Style& st)
    {
        float w = 0;
        layout (text, st, 0, 0, w);
        return w;
    }

    /** Draws text and returns its advance. */
    float drawText (juce::Graphics& g, const juce::String& text, const Style& st, float x, float baseline, juce::Colour c)
    {
        float w = 0;
        auto ga = layout (text, st, x, baseline, w);
        g.setColour (c);
        ga.draw (g);
        return w;
    }

    float ascentOf (const Style& st) { return fontOf (st.face, st.px).getAscent(); }

    void dashedLine (juce::Graphics& g, float x0, float x1, float y, juce::Colour c, float dash = 3, float gap = 3, float thick = 1)
    {
        g.setColour (c);
        for (float x = x0; x < x1; x += dash + gap)
            g.fillRect (x, y, juce::jmin (dash, x1 - x), thick);
    }

    juce::String u8 (const std::string& s) { return juce::String::fromUTF8 (s.c_str()); }
    juce::String u8 (const char* s)        { return juce::String::fromUTF8 (s); }

    const juce::String arrowL = u8 ("\xE2\x97\x82"), arrowR = u8 ("\xE2\x96\xB8");   // ◂ ▸

    juce::String sizeText (ChordSize s)
    {
        constexpr const char* t[] = { "TRIADS", "7TH", "9TH", "11TH", "13TH" };
        return t[(int) s];
    }
    juce::String spreadText (Spread s) { return s == Spread::open ? "OPEN" : s == Spread::wide ? "WIDE" : "CLOSE"; }
    juce::String invertText (int i)    { constexpr const char* t[] = { "ROOT", "1ST", "2ND", "3RD" }; return t[juce::jlimit (0, 3, i)]; }
    juce::String humanizeText (int h)  { return h <= 0 ? juce::String ("OFF") : juce::String (h * 10) + "%"; }

    // KEY pick list: C C♯ D E♭ / E F F♯ G / A♭ A B♭ B
    const char* keyListNames[12] = { "C", "C\xE2\x99\xAF", "D", "E\xE2\x99\xAD", "E", "F", "F\xE2\x99\xAF", "G",
                                     "A\xE2\x99\xAD", "A", "B\xE2\x99\xAD", "B" };

    bool bit (const uint32_t* bits, int n) { return n >= 0 && n < 128 && (bits[n >> 5] >> (n & 31)) & 1u; }
    bool isBlack (int n) { const int pc = mod (n, 12); return pc == 1 || pc == 3 || pc == 6 || pc == 8 || pc == 10; }

    constexpr int kbLo = 48, kbHi = 83;   // C3 … B5
}

//==============================================================================
HarmoniqueEditor::HarmoniqueEditor (HarmoniqueProcessor& p)
    : AudioProcessorEditor (p), processor (p)
{
    // Never take the keyboard: Live's computer MIDI keyboard keeps working while you click here.
    setWantsKeyboardFocus (false);
    setMouseClickGrabsKeyboardFocus (false);
    tooltips.setWantsKeyboardFocus (false);
    tooltips.setMouseClickGrabsKeyboardFocus (false);

    reduceMotion = harmoniqueReduceMotion();
    processor.addChangeListener (this);
    refreshModel();
    setResizable (false, false);
    setSize ((int) W, (int) H);
    startTimerHz (30);
}

HarmoniqueEditor::~HarmoniqueEditor()
{
    releaseScreenKey();
    processor.removeChangeListener (this);
}

void HarmoniqueEditor::changeListenerCallback (juce::ChangeBroadcaster*)
{
    refreshModel();
    rebuild();
}

void HarmoniqueEditor::refreshModel()
{
    settings = processor.getSettings();
    scale = scaleFromPitchClass (settings.rootPc, settings.scale);
    map = buildChordMap (scale, settings.size);
}

void HarmoniqueEditor::apply (const std::function<void (HarmoniqueProcessor::Settings&)>& change)
{
    auto s = processor.getSettings();
    change (s);
    processor.setSettings (s);
    refreshModel();
    rebuild();
}

bool HarmoniqueEditor::pullDisplay()
{
    const auto& d = processor.getDisplay();
    const auto v = d.version.load (std::memory_order_acquire);
    if (v == seenVersion) return false;
    seenVersion = v;
    for (int i = 0; i < 4; ++i) { lit[i] = d.lit[i].load(); pressed[i] = d.pressed[i].load(); }
    lastKeyPc = d.lastKeyPc;
    lastNote = d.lastNote;
    lastWasNote = d.lastWasNote != 0;
    lastInputNote = d.lastInputNote;
    inCount = d.inCount;
    outCount = d.outCount;
    return true;
}

void HarmoniqueEditor::timerCallback()
{
    if (pullDisplay()) rebuild();
    else if (! reduceMotion) repaint();   // the flicker: only re-composites the cached layers
}

float HarmoniqueEditor::flickerOpacity() const
{
    if (reduceMotion) return 1.0f;
    // 7 s loop: 1 → 0.97 (93%) → 0.9 (95%) → 1
    const double t = std::fmod ((juce::Time::getMillisecondCounterHiRes() - startMs) / 7000.0, 1.0);
    if (t < 0.93) return (float) (1.0 - 0.03 * t / 0.93);
    if (t < 0.95) return (float) (0.97 - 0.07 * (t - 0.93) / 0.02);
    return (float) (0.9 + 0.1 * (t - 0.95) / 0.05);
}

//==============================================================================
void HarmoniqueEditor::resized()
{
    rebuild();
}

void HarmoniqueEditor::rebuild()
{
    float s = 1.0f;
    if (auto* d = juce::Desktop::getInstance().getDisplays().getDisplayForRect (getScreenBounds()))
        s = (float) d->scale;
    s = juce::jlimit (1.0f, 3.0f, s);
    renderScale = s;
    const int w = juce::roundToInt (W * s), h = juce::roundToInt (H * s);
    const auto p = juce::Colour (themes[settings.theme].p);

    {
        background = juce::Image (juce::Image::ARGB, w, h, true);
        juce::Graphics g (background);
        g.addTransform (juce::AffineTransform::scale (s));
        drawBackground (g);
    }
    {
        overlay = juce::Image (juce::Image::ARGB, w, h, true);
        juce::Graphics g (overlay);
        g.addTransform (juce::AffineTransform::scale (s));
        drawOverlay (g);
    }

    juce::Image content (juce::Image::ARGB, w, h, true);
    {
        juce::Graphics g (content);
        g.addTransform (juce::AffineTransform::scale (s));
        regions.clear();
        listRegions.clear();
        drawContent (g);
    }
    // Phosphor glow: p at 4 px, then p at 60 % at 12 px, under everything drawn in phosphor.
    composite = juce::Image (juce::Image::ARGB, w, h, true);
    {
        juce::Graphics g (composite);
        juce::DropShadow (p.withAlpha (0.6f), juce::roundToInt (12 * s), {}).drawForImage (g, content);
        juce::DropShadow (p.withAlpha (0.9f), juce::roundToInt (4 * s), {}).drawForImage (g, content);
        g.drawImageAt (content, 0, 0);
    }
    repaint();
}

void HarmoniqueEditor::paint (juce::Graphics& g)
{
    const auto area = getLocalBounds().toFloat();
    g.drawImage (background, area);
    g.setOpacity (flickerOpacity());
    g.drawImage (composite, area);
    g.setOpacity (1.0f);
    g.drawImage (overlay, area);
}

juce::Image HarmoniqueEditor::snapshot()
{
    pullDisplay();
    rebuild();
    juce::Image img (juce::Image::ARGB, (int) W, (int) H, true);
    juce::Graphics g (img);
    paint (g);
    return img;
}

//==============================================================================
void HarmoniqueEditor::drawBackground (juce::Graphics& g)
{
    const auto bg = juce::Colour (themes[settings.theme].bg);
    // Bezel: 160° gradient #3A3530 → #1E1B18 (60%) → #15130F, radius 26
    const juce::Rectangle<float> bezel (0, 0, W, H);
    juce::ColourGradient bz (juce::Colour (0xff3a3530), W * 0.33f, 0, juce::Colour (0xff15130f), W * 0.67f, H, false);
    bz.addColour (0.6, juce::Colour (0xff1e1b18));
    g.setGradientFill (bz);
    g.fillRoundedRectangle (bezel, 26);
    g.setColour (juce::Colours::white.withAlpha (0.08f));
    g.drawRoundedRectangle (bezel.reduced (1.0f).withTrimmedBottom (H * 0.5f), 25, 2);

    // Screen: radial bg → #050302 centred at 50% / 45%, elliptical corners 24 × 20
    const juce::Rectangle<float> screen (14, 14, W - 28, H - 28);
    juce::Path sp;
    sp.addRoundedRectangle (screen.getX(), screen.getY(), screen.getWidth(), screen.getHeight(), 24, 20, true, true, true, true);
    juce::ColourGradient rg (bg, screen.getX() + screen.getWidth() * 0.5f, screen.getY() + screen.getHeight() * 0.45f,
                             juce::Colour (0xff050302), screen.getX(), screen.getY() + screen.getHeight() * 0.45f, true);
    g.setGradientFill (rg);
    g.fillPath (sp);
    // inner shadow, 60 px rgba(0,0,0,.9)
    g.saveState();
    g.reduceClipRegion (sp);
    juce::Path ring;
    ring.addRectangle (screen.expanded (80));
    ring.addPath (sp);
    ring.setUsingNonZeroWinding (false);
    juce::DropShadow (juce::Colours::black.withAlpha (0.9f), 60, {}).drawForPath (g, ring);
    g.restoreState();
}

void HarmoniqueEditor::drawOverlay (juce::Graphics& g)
{
    const juce::Rectangle<float> screen (14, 14, W - 28, H - 28);
    juce::Path sp;
    sp.addRoundedRectangle (screen.getX(), screen.getY(), screen.getWidth(), screen.getHeight(), 24, 20, true, true, true, true);
    g.reduceClipRegion (sp);
    // scanlines: 1 px rgba(0,0,0,.26) every 3 px
    g.setColour (juce::Colours::black.withAlpha (0.26f));
    for (float y = screen.getY(); y < screen.getBottom(); y += 3)
        g.fillRect (screen.getX(), y, screen.getWidth(), 1.0f);
    // vignette: transparent to 58%, then to rgba(0,0,0,.62) at the edge
    juce::ColourGradient v (juce::Colours::transparentBlack, screen.getCentreX(), screen.getCentreY(),
                            juce::Colours::black.withAlpha (0.62f), screen.getX(), screen.getY(), true);
    v.addColour (0.58, juce::Colours::transparentBlack);
    g.setGradientFill (v);
    g.fillRect (screen);
}

void HarmoniqueEditor::drawContent (juce::Graphics& g)
{
    drawStatus (g);
    drawWordmarkRow (g);
    drawHeadline (g);
    drawSettings (g);
    drawKeyboard (g);
    drawFooter (g);
    if (openList != List::none) drawList (g);
}

//==============================================================================
// Pressable text: mono 500 12 px, dashed underline 4 px below; hover / on = inverse video.
namespace
{
    struct Pressable
    {
        juce::Graphics& g;
        juce::Colour p, bg;

        juce::Rectangle<float> draw (const juce::String& text, const Style& st, float x, float baseline, bool on, bool hot,
                                     bool underline = true, float padX = 3, float padY = 2)
        {
            const float w = textWidth (text, st);
            const float asc = ascentOf (st);
            const juce::Rectangle<float> box (x - padX, baseline - asc - padY, w + 2 * padX, asc + padY * 2 + 3);
            if (on || hot)
            {
                g.setColour (p);
                g.fillRect (box);
                drawText (g, text, st, x, baseline, bg);
            }
            else
            {
                drawText (g, text, st, x, baseline, p);
                if (underline) dashedLine (g, x, x + w - st.tracking * st.px, baseline + 4, p.withAlpha (0.7f));
            }
            return box;
        }
    };
}

void HarmoniqueEditor::drawStatus (juce::Graphics& g)
{
    const auto p = juce::Colour (themes[settings.theme].p), bg = juce::Colour (themes[settings.theme].bg);
    const auto st = mono (500, 10, 0.14f);
    const float base = Y0 + 9;
    drawText (g, "HOST " + arrowR + " IN " + juce::String (inCount) + juce::String::fromUTF8 (" \xC2\xB7 ") + "OUT " + juce::String (outCount),
              st, X0, base, p.withAlpha (0.8f));
    const juce::String theme = juce::String ("PHOSPHOR ") + themes[settings.theme].name;
    const float w = textWidth (theme, st);
    Pressable pr { g, p, bg };
    regions.push_back ({ pr.draw (theme, st, X1 - w, base, false, hoverHit == Hit::theme), Hit::theme, 0, "Colour" });
}

void HarmoniqueEditor::drawWordmarkRow (juce::Graphics& g)
{
    const auto p = juce::Colour (themes[settings.theme].p), bg = juce::Colour (themes[settings.theme].bg);

    // HARMONIQUE: Righteous 28 px, outline only (1.3 px), slanted −10°
    {
        const Style st { Faces::get().word, 28, 0.06f, false };
        const float base = Y0 + 24 + 28;
        float adv = 0;
        auto ga = layout ("HARMONIQUE", st, X0, base, adv);
        juce::Path path;
        ga.createPath (path);
        // CSS skewX(−10°) about the baseline: the tops lean right
        path.applyTransform (juce::AffineTransform::translation (0, -base)
                                 .sheared (std::tan (juce::degreesToRadians (-10.0f)), 0)
                                 .translated (0, base));
        g.setColour (p);
        g.strokePath (path, juce::PathStrokeType (1.3f));
    }

    // HUMANIZE ◂ OFF ▸, centred in the window
    {
        const auto label = cond (500, 10, 0.18f);
        const auto val = mono (500, 12, 0.08f);
        const juce::String v = humanizeText (settings.humanize);
        const float gap = 8, arrowW = textWidth (arrowL, val);
        const float total = textWidth ("HUMANIZE", label) + gap + arrowW + 8 + textWidth (v, val) + 8 + arrowW;
        float x = W * 0.5f - total * 0.5f;
        const float base = Y0 + 24 + 22;
        x += drawText (g, "HUMANIZE", label, x, base, p.withAlpha (0.85f)) + gap;
        Pressable pr { g, p, bg };
        regions.push_back ({ pr.draw (arrowL, val, x, base, false, hoverHit == Hit::humanizePrev, false, 4, 2), Hit::humanizePrev, 0, "Less humanize" });
        x += arrowW + 8;
        const bool on = settings.humanize > 0;
        regions.push_back ({ pr.draw (v, val, x, base, on, hoverHit == Hit::humanizeValue), Hit::humanizeValue, 0,
                             "Humanize: loosens timing (up to 30 ms) and velocity (up to \xC2\xB1" "12)" });
        if (openList == List::humanize) listAnchor = regions.back().r;
        x += textWidth (v, val) + 8;
        regions.push_back ({ pr.draw (arrowR, val, x, base, false, hoverHit == Hit::humanizeNext, false, 4, 2), Hit::humanizeNext, 0, "More humanize" });
    }

    // [ CHORDS | NOTES ], top 46 px, right 24 px (of the screen)
    {
        const auto br = cond (400, 13);
        const auto opt = cond (500, 13, 0.14f);
        const float base = 14 + 46 + 5 + 11;
        const float wC = textWidth ("CHORDS", opt), wN = textWidth ("NOTES", opt), wB = textWidth ("]", br);
        float x = W - 14 - 24 - wB - (wN + 16) - (wC + 16) - 6 - textWidth ("[", br) - 6;
        x += drawText (g, "[", br, x, base, p) + 6;
        Pressable pr { g, p, bg };
        regions.push_back ({ pr.draw ("CHORDS", opt, x + 8, base, ! settings.notesMode, hoverHit == Hit::modeChords, false, 8, 5), Hit::modeChords, 0,
                             "Each key plays a chord (MIDI Ch 1)" });
        x += wC + 16;
        regions.push_back ({ pr.draw ("NOTES", opt, x + 8, base, settings.notesMode, hoverHit == Hit::modeNotes, false, 8, 5), Hit::modeNotes, 0,
                             "Each key plays one note of the scale (MIDI Ch 2)" });
        x += wN + 16 + 6;
        drawText (g, "]", br, x, base, p);
    }
}

void HarmoniqueEditor::drawHeadline (juce::Graphics& g)
{
    const auto p = juce::Colour (themes[settings.theme].p);
    bool sounding = false;
    for (auto b : lit) sounding |= b != 0;

    juce::String name = juce::String::fromUTF8 ("\xE2\x80\x94"), label = "NOW";
    if (sounding && lastWasNote && lastNote >= 0)
    {
        name = u8 (scaleNoteLabel (mod (lastNote, 12), scale));
        label = "NOTE";
    }
    else if (sounding && lastKeyPc >= 0)
    {
        const auto& c = map[(size_t) lastKeyPc].chord;
        name = u8 (c.symbol);
        label = juce::String::fromUTF8 ("NOW \xC2\xB7 ") + u8 (c.roman);
    }
    const float top = Y0 + 24 + 34 + 10 + 2;
    const auto big = cond (300, 52);
    const float base = top + ascentOf (big);
    const float w = drawText (g, name, big, X0, base, p);
    drawText (g, label, cond (400, 12, 0.18f), X0 + w + 16, base, p);
    dashedLine (g, X0, X1, base + 12, p.withAlpha (0.45f));
}

void HarmoniqueEditor::drawSettings (juce::Graphics& g)
{
    const auto p = juce::Colour (themes[settings.theme].p), bg = juce::Colour (themes[settings.theme].bg);
    const auto label = cond (500, 10, 0.18f);
    const auto bigVal = cond (300, 22);
    const auto smallVal = cond (500, 14, 0.1f);
    const auto arrow = mono (500, 12, 0.08f);
    const float top = Y0 + 24 + 34 + 10 + 2 + 52 + 22 + 10;
    const float labelBase = top + 9;
    const float bigBase = labelBase + 6 + 20;
    const float smallBase = labelBase + 6 + 14;
    Pressable pr { g, p, bg };

    const juce::String keyText = u8 (noteLabel (scale.root));
    const juce::String scaleText = juce::String (scale.def->name).toUpperCase();
    const float aw = textWidth (arrowL, arrow);
    const float keyW = aw + 8 + textWidth (keyText, bigVal) + 8 + aw;
    const float scaleW = aw + 8 + textWidth (scaleText, bigVal) + 8 + aw;
    const float gap = 22;
    const float colW = (X1 - X0 - keyW - scaleW - 5 * gap) / 4;

    float x = X0;
    auto stepper = [&] (const char* name, const juce::String& v, Hit prev, Hit value, Hit next, List list, const juce::String& tip)
    {
        drawText (g, name, label, x, labelBase, p.withAlpha (0.85f));
        float cx = x;
        regions.push_back ({ pr.draw (arrowL, arrow, cx, bigBase - 4, false, hoverHit == prev, false, 4, 2), prev, 0, {} });
        cx += aw + 8;
        regions.push_back ({ pr.draw (v, bigVal, cx, bigBase, false, hoverHit == value, false, 3, 2), value, 0, tip });
        if (openList == list) listAnchor = regions.back().r;
        cx += textWidth (v, bigVal) + 8;
        regions.push_back ({ pr.draw (arrowR, arrow, cx, bigBase - 4, false, hoverHit == next, false, 4, 2), next, 0, {} });
    };
    stepper ("KEY", keyText, Hit::keyPrev, Hit::keyValue, Hit::keyNext, List::key, "Key: click for the list");
    x += keyW + gap;
    stepper ("SCALE", scaleText, Hit::scalePrev, Hit::scaleValue, Hit::scaleNext, List::scale, "Scale: click for the list");
    x += scaleW + gap;

    auto cycler = [&] (const char* name, const juce::String& v, Hit hit, const juce::String& tip)
    {
        drawText (g, name, label, x, labelBase, p.withAlpha (0.85f));
        regions.push_back ({ pr.draw (v, smallVal, x, smallBase, false, hoverHit == hit), hit, 0, tip });
        x += colW + gap;
    };
    cycler ("CHORDS", sizeText (settings.size), Hit::chords, "Chord size: triads to 13ths");
    cycler ("VOICING", settings.smooth ? "SMOOTH" : "FIXED", Hit::voicing,
            "FIXED: a key always plays the same notes. SMOOTH: chords move as little as possible");
    cycler ("SPREAD", spreadText (settings.spread), Hit::spread, "CLOSE, OPEN (drop 2) or WIDE");
    cycler ("INVERT", invertText (settings.inversion), Hit::invert, "Which chord note is in the bass");
}

void HarmoniqueEditor::drawKeyboard (juce::Graphics& g)
{
    const auto p = juce::Colour (themes[settings.theme].p), bg = juce::Colour (themes[settings.theme].bg);
    const float top = Y0 + 24 + 34 + 10 + 2 + 52 + 22 + 10 + 42 + 10 + 4;
    const float h = 128, ww = (X1 - X0) / 21.0f;
    const int octave = lastInputNote >= 0 ? juce::jlimit (kbLo, kbHi - 11, (lastInputNote / 12) * 12) : 60;

    // good-next keys (pitch classes) in the labelled octave
    bool good[12] {};
    if (lastKeyPc >= 0)
    {
        if (settings.notesMode)
            for (int i = 0; i < map[(size_t) lastKeyPc].chord.count; ++i) good[map[(size_t) lastKeyPc].chord.pcs[(size_t) i]] = true;
        else
            for (auto& s : suggestNext (scale, map, lastKeyPc)) if (! s.spice) good[s.keyPc] = true;
    }

    auto keyLabel = [&] (int note) -> juce::String
    {
        if (settings.notesMode) return u8 (scaleNoteLabel (mod (snapToScale (note, scale.pcs), 12), scale));
        return u8 (map[(size_t) mod (note, 12)].chord.symbol);
    };

    struct K { int note; juce::Rectangle<float> r; };
    std::vector<K> whites, blacks;
    int wi = 0;
    for (int n = kbLo; n <= kbHi; ++n)
    {
        if (! isBlack (n)) whites.push_back ({ n, { X0 + wi++ * ww, top, ww, h } });
        else
        {
            const float bw = ww * 0.62f;
            blacks.push_back ({ n, { X0 + wi * ww - bw * 0.5f, top, bw, h * 0.6f } });
        }
    }

    auto drawKey = [&] (const K& k, bool black)
    {
        const auto r = black ? k.r : k.r.reduced (1.0f, 0.0f);
        const bool isLit = bit (lit, k.note);
        const bool hot = hoverHit == Hit::pianoKey && hoverArg == k.note;
        const float radius = black ? 2.5f : 3.0f;
        juce::Colour fill = black ? bg : p.withAlpha (0.04f);
        if (hot) fill = bg.overlaidWith (p.withAlpha (0.16f));
        if (isLit) fill = p.withAlpha (0.82f);
        g.setColour (fill);
        g.fillRoundedRectangle (r, radius);
        g.setColour (isLit ? p : p.withAlpha (black ? 0.9f : 0.75f));
        g.drawRoundedRectangle (r, radius, 1.0f);

        const auto ink = isLit ? bg : p;
        const bool inOctave = k.note >= octave && k.note < octave + 12;
        const int pc = mod (k.note, 12);
        if (inOctave && good[pc])
        {
            const float bw = r.getWidth() * 0.6f;
            g.setColour (ink);
            g.fillRoundedRectangle (r.getCentreX() - bw * 0.5f, r.getBottom() - (black ? 8 : 9) - 3, bw, 3, 1.5f);
        }
        if (bit (pressed, k.note))
        {
            const float d = black ? 5 : 6;   // a 3 px (2.5 on black keys) circle, above the label and the bar
            g.setColour (ink);
            g.fillEllipse (r.getCentreX() - d * 0.5f, r.getBottom() - (black ? 20 : 34), d, d);
        }
        const auto text = inOctave ? keyLabel (k.note) : juce::String();
        if (inOctave && ! black)
        {
            // mono 500 10 px, 15 px above the bottom; shrinks to fit the key, then drops the tensions
            juce::String t = text;
            Style st = mono (500, 10);
            const float room = r.getWidth() - 4;
            while (textWidth (t, st) > room && st.px > 7) st.px -= 0.5f;
            if (textWidth (t, st) > room && t.containsChar ('(')) t = t.upToFirstOccurrenceOf ("(", false, false);
            while (textWidth (t, st) > room && st.px > 5.5f) st.px -= 0.5f;
            const float tw = textWidth (t, st);
            drawText (g, t, st, r.getCentreX() - tw * 0.5f, r.getBottom() - 15, ink);
        }
        regions.push_back ({ r, Hit::pianoKey, k.note, text });
    };
    for (auto& k : whites) drawKey (k, false);
    for (auto& k : blacks) drawKey (k, true);
    // black keys sit on top: hit-test them first
    std::stable_partition (regions.begin(), regions.end(), [] (const Region& r) { return ! (r.hit == Hit::pianoKey); });
    auto firstKey = std::find_if (regions.begin(), regions.end(), [] (const Region& r) { return r.hit == Hit::pianoKey; });
    std::reverse (firstKey, regions.end());
}

void HarmoniqueEditor::drawFooter (juce::Graphics& g)
{
    const auto p = juce::Colour (themes[settings.theme].p);
    const float base = Y1 - 4;
    // the Oscillate Audioworks mark, 16 px tall
    juce::Path logo = juce::Drawable::parseSVGPath (logoPath);
    logo.applyTransform (juce::AffineTransform::scale (0.1f, -0.1f).translated (0, 444));
    const float sc = 16.0f / 444.0f;
    logo.applyTransform (juce::AffineTransform::scale (sc).translated (X0, base - 13));
    g.setColour (p);
    g.fillPath (logo);
    drawText (g, "OSCILLATE AUDIOWORKS", mono (500, 9, 0.24f), X0 + 992 * sc + 9, base, p);

    const juce::String hint = juce::String::fromUTF8 ("PLAY A\xE2\x80\x93K \xC2\xB7 W E T Y U \xC2\xB7 OCTAVE Z / X");
    const auto st = mono (500, 9, 0.2f);
    drawText (g, hint, st, X1 - textWidth (hint, st), base, p.withAlpha (0.55f));
}

void HarmoniqueEditor::drawList (juce::Graphics& g)
{
    const auto p = juce::Colour (themes[settings.theme].p), bg = juce::Colour (themes[settings.theme].bg);
    const auto item = mono (500, 13);
    const auto head = mono (500, 9, 0.16f);
    const float pad = 10, gapI = 2, ipx = 10;
    const float ipy = openList == List::humanize ? 4.5f : 7.0f;
    const float ih = ascentOf (item) + 2 * ipy + 2;

    struct Item { juce::String text; int value; bool heading; };
    std::vector<Item> items;
    int cols = 1;
    int current = -1;
    if (openList == List::humanize)
    {
        for (int i = 0; i <= 10; ++i) items.push_back ({ humanizeText (i), i, false });
        current = settings.humanize;
    }
    else if (openList == List::key)
    {
        cols = 4;
        for (int i = 0; i < 12; ++i) items.push_back ({ u8 (keyListNames[i]), i, false });
        current = settings.rootPc;
    }
    else
    {
        cols = 3;
        const char* family = nullptr;
        for (auto& d : scaleDefs())
        {
            if (family == nullptr || juce::String (family) != d.family)
            {
                family = d.family;
                items.push_back ({ juce::String (d.family).toUpperCase(), -1, true });
            }
            items.push_back ({ juce::String (d.name).toUpperCase(), (int) d.id, false });
        }
        current = (int) settings.scale;
    }

    // column width = widest item
    float cw = 0;
    for (auto& it : items) if (! it.heading) cw = juce::jmax (cw, textWidth (it.text, item) + 2 * ipx);
    // rows, with headings spanning the full width
    struct Placed { Item it; juce::Rectangle<float> r; };
    std::vector<Placed> placed;
    float y = 0;
    int col = 0;
    for (auto& it : items)
    {
        if (it.heading)
        {
            if (col != 0) { y += ih + gapI; col = 0; }
            placed.push_back ({ it, { 0, y, cols * cw + (cols - 1) * gapI, 16 } });
            y += 16 + gapI;
            continue;
        }
        placed.push_back ({ it, { col * (cw + gapI), y, cw, ih } });
        if (++col == cols) { col = 0; y += ih + gapI; }
    }
    if (col != 0) y += ih + gapI;
    const float boxW = cols * cw + (cols - 1) * gapI + 2 * pad, boxH = y - gapI + 2 * pad;

    // under the clicked value; right-aligned to it, and kept inside the window
    float bx = listAnchor.getX(), by = listAnchor.getBottom() + 4;
    if (bx + boxW > W - 16) bx = listAnchor.getRight() - boxW;
    bx = juce::jlimit (16.0f, W - 16 - boxW, bx);
    by = juce::jmin (by, H - 16 - boxH);
    const juce::Rectangle<float> box (bx, by, boxW, boxH);

    // solid: bg with a 45% black overlay, 1.5 px border, glow p 40 % 18 px
    juce::DropShadow (p.withAlpha (0.4f), 18, {}).drawForRectangle (g, box.toNearestInt());
    g.setColour (bg.overlaidWith (juce::Colours::black.withAlpha (0.45f)));
    g.fillRect (box);
    g.setColour (p);
    g.drawRect (box, 1.5f);
    listRegions.push_back ({ box, Hit::listBox, 0, {} });

    for (auto& pl : placed)
    {
        const auto r = pl.r.translated (bx + pad, by + pad);
        if (pl.it.heading)
        {
            drawText (g, pl.it.text, head, r.getX(), r.getBottom() - 5, p.withAlpha (0.6f));
            continue;
        }
        const bool hot = hoverHit == Hit::listItem && hoverArg == pl.it.value;
        if (hot) { g.setColour (p); g.fillRect (r); }
        else if (pl.it.value == current) { g.setColour (p); g.drawRect (r, 1.0f); }
        drawText (g, pl.it.text, item, r.getX() + ipx, r.getY() + ipy + ascentOf (item), hot ? bg : p);
        listRegions.push_back ({ r, Hit::listItem, pl.it.value, {} });
    }
}

//==============================================================================
const HarmoniqueEditor::Region* HarmoniqueEditor::regionAt (juce::Point<float> pt) const
{
    if (openList != List::none)
    {
        for (auto it = listRegions.rbegin(); it != listRegions.rend(); ++it)
            if (it->r.contains (pt) && it->hit == Hit::listItem) return &*it;
        for (auto& r : listRegions) if (r.r.contains (pt)) return &r;
        return nullptr;
    }
    for (auto& r : regions)
        if (r.r.contains (pt)) return &r;
    return nullptr;
}

void HarmoniqueEditor::mouseMove (const juce::MouseEvent& e)
{
    mousePos = e.position;
    const auto* r = regionAt (e.position);
    const Hit h = r ? r->hit : Hit::none;
    const int a = r ? r->arg : -1;
    setMouseCursor (h == Hit::none || h == Hit::listBox ? juce::MouseCursor::NormalCursor : juce::MouseCursor::PointingHandCursor);
    if (h != hoverHit || a != hoverArg)
    {
        hoverHit = h;
        hoverArg = a;
        rebuild();
    }
}

void HarmoniqueEditor::mouseDown (const juce::MouseEvent& e)
{
    mousePos = e.position;
    if (openList != List::none) { clickList (e.position); return; }
    if (const auto* r = regionAt (e.position)) press (*r);
}

void HarmoniqueEditor::clickList (juce::Point<float> pt)
{
    const auto* r = regionAt (pt);
    if (r != nullptr && r->hit == Hit::listItem)
    {
        const int v = r->arg;
        const auto which = openList;
        openList = List::none;
        apply ([&] (auto& s)
        {
            if (which == List::humanize) s.humanize = v;
            else if (which == List::key) s.rootPc = v;
            else s.scale = (ScaleId) v;
        });
    }
    else if (r == nullptr)
    {
        openList = List::none;   // a click outside closes the list
        rebuild();
    }
}

void HarmoniqueEditor::clickAt (juce::Point<float> pt)
{
    rebuild();
    if (openList != List::none) { clickList (pt); return; }
    if (const auto* r = regionAt (pt))
    {
        const auto copy = *r;
        press (copy);
        if (copy.hit == Hit::pianoKey) releaseScreenKey();
    }
}

juce::Point<float> HarmoniqueEditor::centreOf (int hit, int arg) const
{
    for (auto* list : { &listRegions, &regions })
        for (auto& r : *list)
            if ((int) r.hit == hit && (r.hit != Hit::pianoKey && r.hit != Hit::listItem ? true : r.arg == arg))
                return r.r.getCentre();
    return { -1, -1 };
}

void HarmoniqueEditor::press (const Region& r)
{
    switch (r.hit)
    {
        case Hit::theme:         apply ([] (auto& s) { s.theme = (s.theme + 1) % 4; }); break;
        case Hit::humanizePrev:  apply ([] (auto& s) { s.humanize = juce::jmax (0, s.humanize - 1); }); break;
        case Hit::humanizeNext:  apply ([] (auto& s) { s.humanize = juce::jmin (10, s.humanize + 1); }); break;
        case Hit::modeChords:    apply ([] (auto& s) { s.notesMode = false; }); break;
        case Hit::modeNotes:     apply ([] (auto& s) { s.notesMode = true; }); break;
        case Hit::keyPrev:       apply ([] (auto& s) { s.rootPc = mod (s.rootPc - 1, 12); }); break;
        case Hit::keyNext:       apply ([] (auto& s) { s.rootPc = mod (s.rootPc + 1, 12); }); break;
        case Hit::scalePrev:     apply ([] (auto& s) { s.scale = (ScaleId) mod ((int) s.scale - 1, numScales); }); break;
        case Hit::scaleNext:     apply ([] (auto& s) { s.scale = (ScaleId) mod ((int) s.scale + 1, numScales); }); break;
        case Hit::chords:        apply ([] (auto& s) { s.size = (ChordSize) mod ((int) s.size + 1, numSizes); }); break;
        case Hit::voicing:       apply ([] (auto& s) { s.smooth = ! s.smooth; }); break;
        case Hit::spread:        apply ([] (auto& s) { s.spread = (Spread) mod ((int) s.spread + 1, 3); }); break;
        case Hit::invert:        apply ([] (auto& s) { s.inversion = mod (s.inversion + 1, 4); }); break;
        case Hit::humanizeValue: openList = List::humanize; listAnchor = r.r; rebuild(); break;
        case Hit::keyValue:      openList = List::key;      listAnchor = r.r; rebuild(); break;
        case Hit::scaleValue:    openList = List::scale;    listAnchor = r.r; rebuild(); break;
        case Hit::pianoKey:
            releaseScreenKey();
            screenNote = r.arg;
            processor.screenKey (screenNote, true);
            break;
        case Hit::none: case Hit::listItem: case Hit::listBox: break;
    }
}

void HarmoniqueEditor::releaseScreenKey()
{
    if (screenNote >= 0)
    {
        processor.screenKey (screenNote, false);
        screenNote = -1;
    }
}

void HarmoniqueEditor::mouseDrag (const juce::MouseEvent& e) { mousePos = e.position; }
void HarmoniqueEditor::mouseUp (const juce::MouseEvent&)     { releaseScreenKey(); }

void HarmoniqueEditor::mouseExit (const juce::MouseEvent& e)
{
    if (! e.mods.isAnyMouseButtonDown()) releaseScreenKey();
    if (hoverHit != Hit::none) { hoverHit = Hit::none; hoverArg = -1; rebuild(); }
}

juce::String HarmoniqueEditor::getTooltip()
{
    if (const auto* r = regionAt (mousePos))
        if (r->hit != Hit::pianoKey || isBlack (r->arg)) return r->tip;   // white keys already show their chord
    return {};
}
