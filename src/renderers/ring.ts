"use strict";

/* ─── Progress Ring — 360°; over-100% laps a second arc in the over-colour.
 * (gallery board g4; viewBox 220×220, r 86, stroke 15) */

import {
    GaugeRenderCtx, canvasTokens, arcPath, clearGroup, fitTransform,
    ensureGradients, progFill, applyFont, TNUM, SEGOE, activeZoneColor, polar, fitText, fitLabel,
} from "./helpers";
import { formatModelNumber } from "../shared/numberFormat";
import { contrastRatio } from "../shared/colorHelpers";

export function renderProgressRing(ctx: GaugeRenderCtx): void {
    ensureGradients(ctx.defs);
    const t = canvasTokens(ctx);
    const g = clearGroup(ctx.group).append("g")
        .attr("transform", fitTransform(ctx, 220, 220));
    const hc = ctx.hc, fg = ctx.hcFg;
    const cx = 110, cy = 110, r = 86;

    // Completion fraction: vs target when bound (the board's "of target"),
    // else vs the configured max.
    //
    // This reads the RAW measure, not the scale-clamped one. The ring is the one
    // instrument that is already unbounded by design — it laps a second arc past
    // 100% and captions the overrun — so feeding it a value clamped to `max`
    // destroyed the very state it exists to show: 150 against target 100 on a
    // 0–100 scale arrived as 100 and the ring read a flat "100%", no lap, no
    // overrun caption (NEXUS cycle-15 §1).
    const denom = ctx.target != null && ctx.target !== 0 ? ctx.target : (ctx.max || 100);
    const pv = denom !== 0 ? (ctx.rawValue / denom) * 100 : 0;
    const pf = Math.max(0, pv / 100);
    const percent = (value: number) => formatModelNumber(value / 100,
        "0" + (ctx.decimalPlaces ? "." + "0".repeat(ctx.decimalPlaces) : "") + "%");
    const denominatorLabel = ctx.target != null && ctx.target !== 0 ? "target" : "maximum";

    g.append("circle").attr("cx", cx).attr("cy", cy).attr("r", r)
        .attr("fill", "none").attr("stroke", hc ? "none" : t.track).attr("stroke-width", 15);

    const alpha = Math.max(0, Math.min(1, ctx.valueArc.opacity / 100));
    // Value Arc "Hidden" is meaningful for the DIAL styles, where the value arc
    // is a tint OVERLAY sitting on top of an already-readable zone band. On the
    // progress ring the arc IS the data — honouring "hidden" leaves nothing but
    // an empty track and no reading at all, which is never a useful state and
    // reads as a broken visual. A report that carries arcStyle:"hidden" (the
    // Zone Gauge sample .pbix does) therefore rendered a blank ring.
    // "hidden" falls back to the FULL-WIDTH gradient ring (the listing look),
    // not the thin band — a report that never chose a ring width should get the
    // hero treatment, and "band" stays the explicit opt-in for the thin one.
    const thinBand = ctx.valueArc.style === "band";

    const zoneClr = activeZoneColor(ctx);
    const arcStroke = hc ? fg : (ctx.valueArc.ringColor ?? zoneClr ?? (thinBand ? t.prog : progFill(ctx.theme)));
    if (pf > 0) {
        g.append("path")
            .attr("d", arcPath(cx, cy, r, 90, 90 - 360 * Math.min(pf, 0.99999)))
            .attr("fill", "none")
            .attr("stroke", arcStroke)
            .attr("stroke-width", thinBand ? 6 : 15)
            .attr("stroke-linecap", "round")
            .attr("opacity", alpha)
            .style("filter", (!hc && t.glow) ? `drop-shadow(0 0 8px ${t.prog})` : null);
    }
    if (pf > 1) {
        g.append("path")
            .attr("d", arcPath(cx, cy, r, 90, 90 - 360 * Math.min(pf - 1, 1)))
            .attr("fill", "none").attr("stroke", arcStroke)
            .attr("stroke-width", thinBand ? 6 : 15)
            .attr("stroke-linecap", "round")
            .attr("opacity", alpha)
            .style("filter", !hc ? `drop-shadow(0 0 8px ${zoneClr || t.prog})` : null);
        g.append("circle").attr("cx", cx).attr("cy", 24).attr("r", 6).attr("fill", arcStroke);
    }

    const marker = (value: number, color: string, comparison: boolean) => {
        const completion = Math.max(0, Math.min(1, value / denom));
        const outer = polar(cx, cy, r + 11, 90 - 360 * completion);
        const inner = polar(cx, cy, r - 11, 90 - 360 * completion);
        g.append("line").attr("class", comparison ? "comparison-indicator" : "target-indicator")
            .attr("x1", outer.x).attr("y1", outer.y).attr("x2", inner.x).attr("y2", inner.y)
            .attr("stroke", hc ? fg : color).attr("stroke-width", comparison ? 2 : 3)
            .attr("stroke-dasharray", comparison ? "3 2" : null);
    };
    if (ctx.showTarget && ctx.target != null) marker(ctx.target, ctx.targetColor || t.tgtc, false);
    if (ctx.comparison != null) marker(ctx.comparison, ctx.comparisonColor || t.unit, true);

    if (ctx.showValue) {
        const vt = g.append("text").attr("x", cx).attr("y", 104).attr("text-anchor", "middle")
            .attr("fill", hc ? fg : (ctx.valueColor
                || (ctx.matchNeedleColor ? (ctx.needleColor ?? activeZoneColor(ctx)) : null)
                || t.val))
            .style("font-feature-settings", TNUM)
            .text(percent(pv));
        applyFont(vt, ctx.valueFont, 40, "700");
        fitText(vt, 144, 48);
        if (ctx.showUnit) {
            const ut = g.append("text").attr("x", cx).attr("y", 130).attr("text-anchor", "middle")
                .attr("fill", hc ? fg : (ctx.unitColor
                    || (pv > 100 && zoneClr && contrastRatio(zoneClr, ctx.surface) >= 4.5 ? zoneClr : t.unit)))
                .text(pv > 100 ? `+${percent(pv - 100)} over ${denominatorLabel}` : (ctx.unitText || `of ${denominatorLabel}`));
            applyFont(ut, ctx.unitFont, 12, pv > 100 ? "700" : "600");
            fitLabel(ut, 150);
        }
    }
}
