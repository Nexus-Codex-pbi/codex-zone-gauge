"use strict";

/* ─── Shared instrument-renderer helpers (GAUGE-02) ─────────────────────────
 * Geometry + token maps ported VERBATIM from the normative boards:
 *   docs/design-session-2026-07-09/Gauge Styles Gallery.dc.html (generator
 *   script: P/arc/fa/needle/nT/dial + CSS custom-property token blocks)
 *   docs/design-session-2026-07-09/Codex Zone Gauge.dc.html (remix tokens)
 * Do not tune numbers here without diffing against the boards — they ARE the
 * spec (feedback_pbi_design_board_is_look_source).
 */

import { select, Selection } from "d3-selection";
import { Theme } from "../shared/bandEngine";

export interface GaugeZone {
    from: number;   // domain value
    to: number;     // domain value
    color: string;  // resolved zone colour (fx/theme aware, supplied by visual.ts)
    band: "success" | "warning" | "danger";
}

export interface ValueArcConfig {
    style: "overlay" | "band" | "hidden";
    opacity: number; // 0-100, 100 = fully opaque
    // Explicit ring/arc colour. null = auto (zone colour, then board token).
    ringColor: string | null;
}

export interface FontOpts {
    family: string | null;   // null = board default stack
    size: number | null;     // null/0 = board-proportional size
    bold: boolean;
    italic: boolean;
    underline: boolean;
}

export interface GaugeRenderCtx {
    group: SVGGElement;          // renderer-owned <g>; cleared + redrawn each render
    defs: SVGDefsElement;        // shared <defs> (gradients ensured once per theme)
    width: number;
    height: number;
    titleHeight: number;         // vertical offset consumed by the in-SVG title
    theme: Theme;
    hc: boolean;
    hcFg: string;
    hcBg: string;
    min: number;
    max: number;
    value: number;
    target: number | null;
    comparison: number | null;
    valueText: string;           // formatted by the visual's existing formatter
    unitText: string;            // label/unit line (may be "")
    showValue: boolean;
    showUnit: boolean;           // Value Display "Show Label" toggle
    // Pane colour overrides — null = auto (board/theme token)
    valueColor: string | null;
    unitColor: string | null;
    // Needle Colour is a real, selectable pane property, but the remix dial
    // renderers were colouring the needle purely from stateVsTarget() and never
    // consulted it — a user-picked needle silently did nothing. null = auto
    // (state colour / board token), a set value wins.
    needleColor: string | null;
    targetColor: string | null;
    comparisonColor: string | null;
    valueFont: FontOpts;
    unitFont: FontOpts;
    zones: GaugeZone[];
    valueArc: ValueArcConfig;
    segments: number;            // Segmented Meter LED count (pane, default 18)
    dialFace: string;            // speedo/tach face: auto|slate|deepNavy|ink|none
}

/* ─── Board token maps ──────────────────────────────────────────────────────
 * Straight port of the gallery board's .dk / .lt CSS custom-property blocks. */
export interface GalleryTokens {
    tick: string; maj: string; num: string; needle: string; hubi: string;
    val: string; unit: string; danger: string;
    sg: string; sa: string; sm: string;
    track: string; prog: string; over: string; thtrack: string;
    pillbg: string; pillbd: string; dialdef: string; dfbd: string; tgtc: string;
    glow: boolean;               // dark canvas carries the drop-shadow glows
}

export function galleryTokens(theme: Theme): GalleryTokens {
    return theme === "dark" ? {
        tick: "#6f6a99", maj: "#cfc9f2", num: "#cfc9f2", needle: "#00d9ff", hubi: "#0d0d24",
        val: "#e8e6ff", unit: "#8f8ab8", danger: "#ff2bd6",
        sg: "#8aff2b", sa: "#ffb020", sm: "#ff2bd6",
        track: "#20203a", prog: "#00d9ff", over: "#8aff2b", thtrack: "#191937",
        pillbg: "#101033", pillbd: "#00d9ff", dialdef: "#131333", dfbd: "rgba(124,58,237,0.35)", tgtc: "#b9a7ff",
        glow: true,
    } : {
        tick: "#a7a2c4", maj: "#33304a", num: "#33304a", needle: "#14141f", hubi: "#ffffff",
        val: "#14141f", unit: "#5b5b74", danger: "#c81d6b",
        sg: "#1f8a3b", sa: "#a85f00", sm: "#c81d6b",
        track: "#e2e4ef", prog: "#0384a3", over: "#1f8a3b", thtrack: "#e2e4ef",
        pillbg: "#f1f3fa", pillbd: "#0384a3", dialdef: "#eceef5", dfbd: "rgba(0,0,0,0.10)", tgtc: "#6d28d9",
        glow: false,
    };
}

/* ─── Geometry (verbatim port of the board's generator) ───────────────────── */
const D2R = Math.PI / 180;

export function polar(cx: number, cy: number, r: number, aDeg: number): { x: number; y: number } {
    return { x: +(cx + r * Math.cos(aDeg * D2R)).toFixed(2), y: +(cy - r * Math.sin(aDeg * D2R)).toFixed(2) };
}

/** Open arc path from angle a0 to a1 (degrees, mathematical orientation). */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
    const p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    const lg = Math.abs(a0 - a1) > 180 ? 1 : 0;
    return `M${p0.x} ${p0.y} A${r} ${r} 0 ${lg} 1 ${p1.x} ${p1.y}`;
}

/** Closed pie/face wedge path (dial face plate). */
export function faceArcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
    const p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    const lg = Math.abs(a0 - a1) > 180 ? 1 : 0;
    return `M${cx} ${cy} L${p0.x} ${p0.y} A${r} ${r} 0 ${lg} 1 ${p1.x} ${p1.y} Z`;
}

/** Board needle polygon: long nose, short counterweight tail. */
export function needlePoints(cx: number, cy: number, len: number, w: number): string {
    return `${cx + len},${cy} ${cx},${cy - w} ${cx - len * 0.22},${cy} ${cx},${cy + w}`;
}

export function needleTransform(cx: number, cy: number, aDeg: number): string {
    return `rotate(${(-aDeg).toFixed(2)} ${cx} ${cy})`;
}

export interface DialCfg {
    rOut: number; rMajIn: number; rMinIn: number; rNum: number;
    majCount: number; minorPer?: number;
    labels: string[]; redFrom?: number; redTo?: number;
    // Target-relative banding has two danger runs, so tick colouring needs the
    // full set rather than a single from/to pair. redFrom/redTo stay for the
    // threshold model's single run.
    redRanges?: Array<{ f0: number; f1: number }>;
}
export interface DialTicks {
    maj: { x1: number; y1: number; x2: number; y2: number; red: boolean }[];
    min: { x1: number; y1: number; x2: number; y2: number }[];
    nums: { x: number; y: number; label: string; red: boolean }[];
}

/** Tick/number generator — verbatim port of the board's dial(). */
export function dialTicks(cx: number, cy: number, a0: number, span: number, cfg: DialCfg): DialTicks {
    const maj: DialTicks["maj"] = [], min: DialTicks["min"] = [], nums: DialTicks["nums"] = [];
    const mc = cfg.majCount, mp = cfg.minorPer || 0;
    for (let i = 0; i < mc; i++) {
        const f = i / (mc - 1), a = a0 - span * f;
        const red = cfg.redRanges?.length
            ? cfg.redRanges.some(r => f >= r.f0 - 1e-6 && f <= r.f1 + 1e-6)
            : (cfg.redFrom != null && f >= cfg.redFrom - 1e-6 && f <= (cfg.redTo ?? 1) + 1e-6);
        const o = polar(cx, cy, cfg.rOut, a), ip = polar(cx, cy, cfg.rMajIn, a), np = polar(cx, cy, cfg.rNum, a);
        maj.push({ x1: o.x, y1: o.y, x2: ip.x, y2: ip.y, red });
        nums.push({ x: np.x, y: np.y, label: cfg.labels[i], red });
    }
    for (let g = 0; g < mc - 1; g++) for (let k = 1; k <= mp; k++) {
        const f = (g + k / (mp + 1)) / (mc - 1), a = a0 - span * f;
        const o = polar(cx, cy, cfg.rOut, a), ip = polar(cx, cy, cfg.rMinIn, a);
        min.push({ x1: o.x, y1: o.y, x2: ip.x, y2: ip.y });
    }
    return { maj, min, nums };
}

/* ─── Gradients (board <defs>, both themes ensured once) ──────────────────── */
export function ensureGradients(defs: SVGDefsElement): void {
    const d = select(defs);
    if (!d.select("#zgDomeD").empty()) return;
    const radial = (id: string, stops: [string, string][], cx = "50%", cy = "30%", r = "78%") => {
        const g = d.append("radialGradient").attr("id", id).attr("cx", cx).attr("cy", cy).attr("r", r);
        stops.forEach(([off, col]) => g.append("stop").attr("offset", off).attr("stop-color", col));
    };
    const linear = (id: string, stops: [string, string][], x1 = "0", y1 = "0", x2 = "1", y2 = "0") => {
        const g = d.append("linearGradient").attr("id", id)
            .attr("gradientUnits", "objectBoundingBox")
            .attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
        stops.forEach(([off, col]) => g.append("stop").attr("offset", off).attr("stop-color", col));
    };
    radial("zgDomeD", [["0", "#20204a"], ["1", "#090920"]]);
    radial("zgDomeL", [["0", "#ffffff"], ["1", "#dfe3ee"]]);
    radial("zgHubD", [["0", "#8ff4ff"], ["0.5", "#00d9ff"], ["1", "#017c99"]], "36%", "30%", "75%");
    radial("zgHubL", [["0", "#d3eff6"], ["0.55", "#0384a3"], ["1", "#02515f"]], "36%", "30%", "75%");
    linear("zgNdlD", [["0", "#e6fbff"], ["0.5", "#00d9ff"], ["1", "#008fb0"]]);
    linear("zgNdlL", [["0", "#3a3a4c"], ["1", "#14141f"]]);
    // thermometer + progress fills (vertical / arc sweeps)
    linear("zgThermD", [["0", "#ff7be0"], ["1", "#ff2bd6"]], "0", "0", "0", "1");
    linear("zgThermL", [["0", "#e2569b"], ["1", "#c81d6b"]], "0", "0", "0", "1");
    linear("zgProgD", [["0", "#8ff4ff"], ["1", "#00d9ff"]]);
    linear("zgProgL", [["0", "#3fb3cf"], ["1", "#0384a3"]]);
}

export const domeFill = (t: Theme): string => t === "dark" ? "url(#zgDomeD)" : "url(#zgDomeL)";
export const hubFill = (t: Theme): string => t === "dark" ? "url(#zgHubD)" : "url(#zgHubL)";
export const needleFill = (t: Theme): string => t === "dark" ? "url(#zgNdlD)" : "url(#zgNdlL)";
export const thermFill = (t: Theme): string => t === "dark" ? "url(#zgThermD)" : "url(#zgThermL)";
export const progFill = (t: Theme): string => t === "dark" ? "url(#zgProgD)" : "url(#zgProgL)";

/* ─── Misc ────────────────────────────────────────────────────────────────── */
export function clearGroup(g: SVGGElement): Selection<SVGGElement, unknown, null, undefined> {
    const sel = select(g);
    sel.selectAll("*").remove();
    return sel;
}

/** Fit a design-space viewBox into the tile below the title, preserving
 * aspect — WITH breathing room (Neil live-QA 2026-07-17: edge-to-edge scale
 * read as "too zoomed in" and collided with the corner-accent brackets).
 * Margin ≈7% of the smaller tile side, floor 12px. */
export function fitTransform(ctx: GaugeRenderCtx, designW: number, designH: number): string {
    const availH = Math.max(10, ctx.height - ctx.titleHeight);
    const m = Math.max(12, Math.min(ctx.width, availH) * 0.07);
    const iw = Math.max(10, ctx.width - 2 * m);
    const ih = Math.max(10, availH - 2 * m);
    const s = Math.min(iw / designW, ih / designH);
    const tx = (ctx.width - designW * s) / 2;
    const ty = ctx.titleHeight + (availH - designH * s) / 2;
    return `translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${s.toFixed(4)})`;
}

export function fraction(ctx: GaugeRenderCtx, v: number): number {
    const span = ctx.max - ctx.min;
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, (v - ctx.min) / span));
}

/** Danger-zone SPAN as domain fractions + its configured colour. The board
 * drew its red band from redFrom→end because its instruments put danger at
 * the top of scale; this visual's zone model is ascending (zone 1 = Poor at
 * the BOTTOM), so the band must follow the actual zone extent — caught live
 * on the sample dataset 2026-07-17, where from→end painted the whole dial. */
export function dangerSpan(ctx: GaugeRenderCtx): { f0: number; f1: number; color: string } | null {
    const all = dangerSpans(ctx);
    return all.length ? all[0] : null;
}

/** ALL danger runs as domain fractions. The ascending threshold model has one
 *  contiguous danger zone at the bottom, so this returns a single span and the
 *  dial renders exactly as before. TARGET-RELATIVE banding puts danger on BOTH
 *  sides of the target — collapsing those to min(from)..max(to) (what the old
 *  single-span version did) spanned the whole scale and painted the entire dial
 *  red, so each run has to stay separate. */
export function dangerSpans(ctx: GaugeRenderCtx): Array<{ f0: number; f1: number; color: string }> {
    return ctx.zones
        .filter(z => z.band === "danger" && z.to > z.from)
        .map(z => ({ f0: fraction(ctx, z.from), f1: fraction(ctx, z.to), color: z.color }))
        .filter(s => s.f1 > s.f0);
}

/** EVERY zone as domain fractions + its colour, in scale order. The dial family
 *  used to draw only the danger runs, so a "Zone Gauge" showed exactly one of its
 *  three zones — and target-relative banding (green at target, amber buffer either
 *  side) was computed but invisible. Renderers draw the full set. */
export function zoneSpans(ctx: GaugeRenderCtx): Array<{ f0: number; f1: number; color: string; band: string }> {
    return ctx.zones
        .filter(z => z.to > z.from)
        .map(z => ({ f0: fraction(ctx, z.from), f1: fraction(ctx, z.to), color: z.color, band: z.band }))
        .filter(s => s.f1 > s.f0);
}

/** State vs target, per the board speedometer rule. */
export function stateVsTarget(value: number, target: number | null): "succ" | "warn" | "dang" | null {
    if (target == null) return null;
    return value >= target ? "succ" : value >= 0.9 * target ? "warn" : "dang";
}

export const SEGOE = "Segoe UI, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
export const TNUM = '"tnum"';

/** Apply a pane FontControl bundle to a text selection, falling back to the
 * board's own size/weight when untouched (weightFor idiom). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFont(sel: any, f: FontOpts, boardPx: number, fallbackWeight: string): void {
    sel.style("font-family", f.family || SEGOE)
        .style("font-size", `${(f.size && f.size > 0) ? f.size : boardPx}px`)
        .style("font-weight", f.bold ? "700" : fallbackWeight)
        .style("font-style", f.italic ? "italic" : "normal")
        .style("text-decoration", f.underline ? "underline" : "none");
}
