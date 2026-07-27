"use strict";

/* ─── Dial family: Pressure Dial (270°) · Speedometer (240°) · Tachometer ───
 * Geometry constants are the gallery board's own (g1/g2/g3 blocks). */

import {
    GaugeRenderCtx, galleryTokens, dialTicks, arcPath, faceArcPath,
    needlePoints, needleTransform, polar, clearGroup, fitTransform,
    fraction, dangerSpans, zoneSpans, stateVsTarget, ensureGradients,
    domeFill, hubFill, needleFill, applyFont, TNUM, DialCfg, SEGOE,
} from "./helpers";

interface DialSpec {
    designW: number; designH: number;
    cx: number; cy: number;
    a0: number; span: number;      // start angle + sweep (board orientation)
    cfg: DialCfg;
    face: boolean;                  // dome face plate (speedo/tach)
    needleLen: number;
    bandR: number | null;           // red band radius (null = no band)
    valueY: number; unitY: number;  // text baselines in design space
    valueSize: number;
}

function labelsFor(ctx: GaugeRenderCtx, count: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
        const v = ctx.min + (ctx.max - ctx.min) * (i / (count - 1));
        out.push(String(Math.round(v * 10) / 10));
    }
    return out;
}

function renderDial(ctx: GaugeRenderCtx, spec: DialSpec, redSpan: { f0: number; f1: number; color: string } | null, stateClr: string | null): void {
    ensureGradients(ctx.defs);
    const t = galleryTokens(ctx.theme);
    const g = clearGroup(ctx.group).append("g")
        .attr("transform", fitTransform(ctx, spec.designW, spec.designH));
    const { cx, cy, a0, span } = spec;
    const hc = ctx.hc, fg = ctx.hcFg, bg = ctx.hcBg;

    // Face plate (speedo/tach) — dome gradient, spec arc highlight.
    // Wedge ends exactly at the scale end: the board's fa(...,210,-30) IS
    // a0 - span, NOT a further -30 (transcription bug caught in Neil's
    // live QA — the dome spilled 30° past the top value).
    // Dial face style (pane; board faceMap port): Auto = dome gradient,
    // flat colours otherwise, None keeps only the outline ring. The three
    // flat faces are DARK — everything sitting ON the face (ticks, numbers,
    // band, target tick, value arc, needle, hub) adapts to the face like
    // text adapts to the Background card (Neil live-QA 2026-07-17: light-
    // canvas tokens washed out on slate/navy/ink faces).
    // Light Grey is the first LIGHT flat face (Neil 2026-07-27) — a pale dial on
    // a dark canvas reads well, but only if everything sitting ON it flips with
    // it. The dark-face path already does exactly this in reverse, so a light
    // face is its mirror: adopt the LIGHT token set so ticks, numbers, needle
    // and value render dark-on-light instead of washing out to invisible.
    const FACE_MAP: Record<string, string> = { slate: "#1b1b3a", deepNavy: "#07223a", ink: "#04040e", lightGrey: "#dfe3ee", none: "transparent" };
    const faceIsDarkFlat = spec.face && !hc && ["slate", "deepNavy", "ink"].indexOf(ctx.dialFace) >= 0;
    const faceIsLightFlat = spec.face && !hc && ["lightGrey"].indexOf(ctx.dialFace) >= 0;
    const ft = faceIsDarkFlat ? galleryTokens("dark") : faceIsLightFlat ? galleryTokens("light") : t;
    const faceThemeKey = faceIsDarkFlat ? "dark" as const : faceIsLightFlat ? "light" as const : ctx.theme;
    if (spec.face) {
        const faceFill = hc ? bg
            : (ctx.dialFace && ctx.dialFace !== "auto")
                ? (FACE_MAP[ctx.dialFace] ?? domeFill(ctx.theme))
                : domeFill(ctx.theme);
        g.append("path")
            .attr("d", faceArcPath(cx, cy, 112, a0, a0 - span))
            .attr("fill", faceFill)
            .attr("stroke", hc ? fg : t.dfbd).attr("stroke-width", 1);
        if (!hc) {
            g.append("path")
                .attr("d", arcPath(cx, cy, 100, 152, 28))
                .attr("fill", "none").attr("stroke", "rgba(255,255,255,0.16)")
                .attr("stroke-width", 3).attr("stroke-linecap", "round");
        }
    }

    // Red band (pressure dial / tachometer) — spans the ACTUAL danger
    // zone in its configured colour (see dangerSpan note in helpers).
    // Target-relative banding yields TWO danger runs (below and above target),
    // so every run is drawn. Threshold banding yields one and is unchanged.
    const redRuns = dangerSpans(ctx);
    // Draw EVERY zone, not just danger. Previously only the red runs were
    // painted, so the dial showed one of its three zones and target-relative
    // banding (green at target, amber either side) never appeared at all.
    if (spec.bandR != null) {
        for (const run of zoneSpans(ctx)) {
            const bandClr = hc ? fg : (run.color
                || (run.band === "success" ? ft.sg : run.band === "warning" ? ft.sa : ft.danger));
            g.append("path")
                .attr("d", arcPath(cx, cy, spec.bandR, a0 - span * run.f0, a0 - span * run.f1))
                .attr("fill", "none").attr("stroke", bandClr)
                .attr("stroke-width", 7).attr("stroke-linecap", "round")
                .style("filter", (!hc && ctx.theme === "dark") ? `drop-shadow(0 0 6px ${bandClr})` : null);
        }
    }

    // Ticks + numbers
    const cfg: DialCfg = { ...spec.cfg, labels: labelsFor(ctx, spec.cfg.majCount), redRanges: redRuns };
    const ticks = dialTicks(cx, cy, a0, span, cfg);
    for (const m of ticks.min) {
        g.append("line").attr("x1", m.x1).attr("y1", m.y1).attr("x2", m.x2).attr("y2", m.y2)
            .attr("stroke", hc ? fg : ft.tick).attr("stroke-width", 2).attr("stroke-linecap", "round");
    }
    for (const m of ticks.maj) {
        g.append("line").attr("x1", m.x1).attr("y1", m.y1).attr("x2", m.x2).attr("y2", m.y2)
            .attr("stroke", hc ? fg : (m.red ? ft.danger : ft.maj)).attr("stroke-width", 2.6).attr("stroke-linecap", "round");
    }
    for (const n of ticks.nums) {
        g.append("text").attr("x", n.x).attr("y", n.y)
            .attr("text-anchor", "middle").attr("dominant-baseline", "central")
            .attr("fill", hc ? fg : (n.red ? ft.danger : ft.num))
            .style("font-family", SEGOE).style("font-size", "13px").style("font-weight", "600")
            .text(n.label);
    }

    // Target tick (violet, per board tgt)
    if (ctx.target != null) {
        const aT = a0 - span * fraction(ctx, ctx.target);
        const to = polar(cx, cy, spec.cfg.rOut + 6, aT), ti = polar(cx, cy, spec.cfg.rMajIn - 4, aT);
        g.append("line").attr("x1", to.x).attr("y1", to.y).attr("x2", ti.x).attr("y2", ti.y)
            .attr("stroke", hc ? fg : (ctx.targetColor || ft.tgtc)).attr("stroke-width", 3).attr("stroke-linecap", "round");
    }

    // Value Arc (GAUGE-03) — sweep from scale start to the value
    const vFrac = fraction(ctx, ctx.value);
    if (ctx.valueArc.style !== "hidden" && vFrac > 0) {
        const alpha = Math.max(0, Math.min(1, ctx.valueArc.opacity / 100));
        const r = ctx.valueArc.style === "band" ? spec.cfg.rOut + 3 : (spec.cfg.rOut + spec.cfg.rMajIn) / 2;
        const w = ctx.valueArc.style === "band" ? 4 : (spec.cfg.rOut - spec.cfg.rMajIn) + 4;
        g.append("path")
            .attr("d", arcPath(cx, cy, r, a0, a0 - span * vFrac))
            .attr("fill", "none").attr("stroke", hc ? fg : ft.prog)
            .attr("stroke-width", w).attr("stroke-linecap", "round")
            .attr("opacity", (ctx.valueArc.style === "overlay" ? 0.28 : 1) * alpha);
    }

    // Needle + hub
    // A pane-picked Needle Colour wins over the state colour; unset falls back
    // to stateVsTarget() and then the board token, as before.
    const needleClr = ctx.needleColor ?? stateClr ?? null;
    g.append("polygon")
        .attr("points", needlePoints(cx, cy, spec.needleLen, 6))
        .attr("transform", needleTransform(cx, cy, a0 - span * vFrac))
        .attr("fill", hc ? fg : (needleClr ?? needleFill(faceThemeKey)))
        .attr("stroke", hc ? bg : null).attr("stroke-width", hc ? 2 : null);
    g.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 9).attr("fill", hc ? fg : hubFill(faceThemeKey));
    if (!hc) g.append("circle").attr("cx", cx - 3).attr("cy", cy - 3).attr("r", 3).attr("fill", "rgba(255,255,255,0.6)");
    g.append("circle").attr("cx", cx).attr("cy", cy).attr("r", 3).attr("fill", hc ? bg : ft.hubi);

    // Value + unit — pane colour/font overrides win; board look is the auto
    if (ctx.showValue) {
        const vt = g.append("text").attr("x", cx).attr("y", spec.valueY).attr("text-anchor", "middle")
            .attr("fill", hc ? fg : (ctx.valueColor || needleClr || ft.val))
            .style("font-feature-settings", TNUM)
            .text(ctx.valueText);
        applyFont(vt, ctx.valueFont, spec.valueSize, "700");
        if (ctx.unitText && ctx.showUnit) {
            const ut = g.append("text").attr("x", cx).attr("y", spec.unitY).attr("text-anchor", "middle")
                .attr("fill", hc ? fg : (ctx.unitColor || ft.unit))
                .style("letter-spacing", "0.08em")
                .text(ctx.unitText);
            applyFont(ut, ctx.unitFont, 12, "600");
        }
    }
}

/** Pressure Dial — 270° sweep, red band from the danger zone. (board g1) */
export function renderPressureDial(ctx: GaugeRenderCtx): void {
    renderDial(ctx, {
        designW: 240, designH: 214, cx: 120, cy: 118, a0: 225, span: 270,
        // rNum pulled 70 -> 60: on a 270° sweep the first and last labels (0 and
        // 100) land at the dial's open bottom lip, and at r70 they sat level with
        // the arc ends and the value readout, reading as spilling OUT of the bowl
        // rather than sitting in it. r60 tucks both ends inside the band.
        // valueY nudged down so the readout clears that same bottom label pair.
        cfg: { rOut: 98, rMajIn: 84, rMinIn: 90, rNum: 60, majCount: 11, minorPer: 1, labels: [] },
        face: false, needleLen: 86, bandR: 101, valueY: 176, unitY: 194, valueSize: 30,
    }, null, null);
}

/** Speedometer — 240° dome face; needle + readout recolour vs target. (board g2) */
export function renderSpeedometer(ctx: GaugeRenderCtx): void {
    const t = galleryTokens(ctx.theme);
    const st = stateVsTarget(ctx.value, ctx.target, ctx.lowerIsBetter);
    const clr = st === "succ" ? t.sg : st === "warn" ? t.sa : st === "dang" ? t.sm : null;
    renderDial(ctx, {
        designW: 250, designH: 200, cx: 125, cy: 122, a0: 210, span: 240,
        cfg: { rOut: 104, rMajIn: 88, rMinIn: 95, rNum: 74, majCount: 7, minorPer: 3, labels: [] },
        face: true, needleLen: 92, bandR: 104, valueY: 169, unitY: 196, valueSize: 22,
    }, null, clr);
}

/** Tachometer — 240° dome face + redline band from the danger zone. (board g3) */
export function renderTachometer(ctx: GaugeRenderCtx): void {
    renderDial(ctx, {
        designW: 250, designH: 200, cx: 125, cy: 122, a0: 210, span: 240,
        cfg: { rOut: 104, rMajIn: 88, rMinIn: 95, rNum: 74, majCount: 9, minorPer: 1, labels: [] },
        face: true, needleLen: 92, bandR: 107, valueY: 164, unitY: 182, valueSize: 30,
    }, null, null);
}
