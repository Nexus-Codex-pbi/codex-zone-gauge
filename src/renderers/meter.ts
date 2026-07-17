"use strict";

/* ─── Segmented Meter — 18 LED blocks over a 200° fan; zone colours by
 * position; lit up to the value. Target renders as a tick mark on the block
 * track (Decision 2026-07-17 — needle-less styles get ticks).
 * (gallery board g5; viewBox 250×190, r 94, seg stroke 13) */

import {
    GaugeRenderCtx, galleryTokens, arcPath, polar, clearGroup, fitTransform,
    fraction, applyFont, TNUM, SEGOE,
} from "./helpers";

const N = 18, A0 = 190, SPAN = 200, CX = 125, CY = 130, R = 94;

export function renderSegmentedMeter(ctx: GaugeRenderCtx): void {
    const t = galleryTokens(ctx.theme);
    const g = clearGroup(ctx.group).append("g")
        .attr("transform", fitTransform(ctx, 250, 190));
    const hc = ctx.hc, fg = ctx.hcFg;
    const sf = fraction(ctx, ctx.value);

    for (let i = 0; i < N; i++) {
        const aS = A0 - SPAN * ((i + 0.14) / N), aE = A0 - SPAN * ((i + 0.86) / N);
        // Zone colour by the segment's domain position — real zones when
        // configured, the board's 0.55/0.8 split as fallback.
        const pos = (i + 0.5) / N;
        const dv = ctx.min + (ctx.max - ctx.min) * pos;
        const zone = ctx.zones.find(z => dv >= z.from && dv <= z.to);
        const col = hc ? fg
            : zone ? (zone.band === "success" ? t.sg : zone.band === "warning" ? t.sa : t.sm)
            : pos < 0.55 ? t.sg : pos < 0.8 ? t.sa : t.sm;
        const on = (i + 0.5) / N <= sf;
        g.append("path")
            .attr("d", arcPath(CX, CY, R, aS, aE))
            .attr("fill", "none").attr("stroke", col)
            .attr("stroke-width", 13).attr("stroke-linecap", "butt")
            .attr("opacity", on ? 1 : (hc ? 0.4 : 0.15))
            .style("filter", (on && !hc && t.glow) ? `drop-shadow(0 0 5px ${col})` : null);
    }

    // Target / comparison as tick marks across the block track
    const tickAt = (v: number, clr: string, w: number) => {
        const a = A0 - SPAN * fraction(ctx, v);
        const o = polar(CX, CY, R + 12, a), i2 = polar(CX, CY, R - 12, a);
        g.append("line").attr("x1", o.x).attr("y1", o.y).attr("x2", i2.x).attr("y2", i2.y)
            .attr("stroke", hc ? fg : clr).attr("stroke-width", w).attr("stroke-linecap", "round");
    };
    if (ctx.target != null) tickAt(ctx.target, ctx.targetColor || t.tgtc, 3);
    if (ctx.comparison != null) tickAt(ctx.comparison, ctx.comparisonColor || t.unit, 2);

    if (ctx.showValue) {
        const vt = g.append("text").attr("x", CX).attr("y", 120).attr("text-anchor", "middle")
            .attr("fill", hc ? fg : (ctx.valueColor || t.val))
            .style("font-feature-settings", TNUM)
            .text(ctx.valueText);
        applyFont(vt, ctx.valueFont, 30, "700");
        if (ctx.unitText && ctx.showUnit) {
            const ut = g.append("text").attr("x", CX).attr("y", 140).attr("text-anchor", "middle")
                .attr("fill", hc ? fg : (ctx.unitColor || t.unit))
                .style("letter-spacing", "0.08em")
                .text(ctx.unitText);
            applyFont(ut, ctx.unitFont, 12, "600");
        }
    }
}
