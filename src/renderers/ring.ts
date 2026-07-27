"use strict";

/* ─── Progress Ring — 360°; over-100% laps a second arc in the over-colour.
 * (gallery board g4; viewBox 220×220, r 86, stroke 15) */

import {
    GaugeRenderCtx, galleryTokens, arcPath, clearGroup, fitTransform,
    ensureGradients, progFill, applyFont, TNUM, SEGOE,
} from "./helpers";

export function renderProgressRing(ctx: GaugeRenderCtx): void {
    ensureGradients(ctx.defs);
    const t = galleryTokens(ctx.theme);
    const g = clearGroup(ctx.group).append("g")
        .attr("transform", fitTransform(ctx, 220, 220));
    const hc = ctx.hc, fg = ctx.hcFg;
    const cx = 110, cy = 110, r = 86;

    // Completion fraction: vs target when bound (the board's "of target"),
    // else vs the configured max.
    const denom = ctx.target != null && ctx.target !== 0 ? ctx.target : (ctx.max || 100);
    const pv = denom !== 0 ? (ctx.value / denom) * 100 : 0;
    const pf = Math.max(0, pv / 100);

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

    // ZONE COLOUR drives the ring (v1 behaviour, dropped in the remix). The
    // pickers stayed in the pane but nothing read them here, so a report that
    // set Zone 1/2/3 Colour saw no change on the ring at all. Resolve the zone
    // the value sits in and use its colour, honouring the D-16 sentinel rule:
    // a colour still at its declared default means "auto", so the board token
    // wins; anything else is an explicit authorial choice and beats the token.
    const ZONE_SENTINELS = ["#e60e22", "#d4920a", "#007064"];
    const activeZone = ctx.zones.find(z => ctx.value >= z.from && ctx.value <= z.to)
        ?? ctx.zones[ctx.zones.length - 1];
    const zoneClr = activeZone
        && activeZone.color
        && ZONE_SENTINELS.indexOf(String(activeZone.color).toLowerCase()) < 0
        ? activeZone.color : null;
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
            .attr("fill", "none").attr("stroke", hc ? fg : t.over)
            .attr("stroke-width", thinBand ? 6 : 15)
            .attr("stroke-linecap", "round")
            .attr("opacity", alpha)
            .style("filter", !hc ? `drop-shadow(0 0 8px ${t.over})` : null);
        g.append("circle").attr("cx", cx).attr("cy", 24).attr("r", 6).attr("fill", hc ? fg : t.over);
    }

    if (ctx.showValue) {
        const vt = g.append("text").attr("x", cx).attr("y", 104).attr("text-anchor", "middle")
            .attr("fill", hc ? fg : (ctx.valueColor || t.val))
            .style("font-feature-settings", TNUM)
            .text(`${Math.round(pv)}%`);
        applyFont(vt, ctx.valueFont, 40, "700");
        const ut = g.append("text").attr("x", cx).attr("y", 130).attr("text-anchor", "middle")
            .attr("fill", hc ? fg : (pv > 100 ? t.over : (ctx.unitColor || t.unit)))
            .text(pv > 100 ? `+${Math.round(pv - 100)}% over target` : (ctx.unitText || "of target"));
        applyFont(ut, ctx.unitFont, 12, pv > 100 ? "700" : "600");
    }
}
