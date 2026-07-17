"use strict";

/* ─── Progress Ring — 360°; over-100% laps a second arc in the over-colour.
 * (gallery board g4; viewBox 220×220, r 86, stroke 15) */

import {
    GaugeRenderCtx, galleryTokens, arcPath, clearGroup, fitTransform,
    ensureGradients, progFill, SEGOE, TNUM,
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
    if (pf > 0 && ctx.valueArc.style !== "hidden") {
        g.append("path")
            .attr("d", arcPath(cx, cy, r, 90, 90 - 360 * Math.min(pf, 0.99999)))
            .attr("fill", "none")
            .attr("stroke", hc ? fg : (ctx.valueArc.style === "band" ? t.prog : progFill(ctx.theme)))
            .attr("stroke-width", ctx.valueArc.style === "band" ? 6 : 15)
            .attr("stroke-linecap", "round")
            .attr("opacity", alpha)
            .style("filter", (!hc && t.glow) ? `drop-shadow(0 0 8px ${t.prog})` : null);
    }
    if (pf > 1 && ctx.valueArc.style !== "hidden") {
        g.append("path")
            .attr("d", arcPath(cx, cy, r, 90, 90 - 360 * Math.min(pf - 1, 1)))
            .attr("fill", "none").attr("stroke", hc ? fg : t.over)
            .attr("stroke-width", ctx.valueArc.style === "band" ? 6 : 15)
            .attr("stroke-linecap", "round")
            .attr("opacity", alpha)
            .style("filter", !hc ? `drop-shadow(0 0 8px ${t.over})` : null);
        g.append("circle").attr("cx", cx).attr("cy", 24).attr("r", 6).attr("fill", hc ? fg : t.over);
    }

    if (ctx.showValue) {
        g.append("text").attr("x", cx).attr("y", 104).attr("text-anchor", "middle")
            .attr("fill", hc ? fg : t.val)
            .style("font-family", SEGOE).style("font-size", "40px")
            .style("font-weight", "700").style("font-feature-settings", TNUM)
            .text(`${Math.round(pv)}%`);
        g.append("text").attr("x", cx).attr("y", 130).attr("text-anchor", "middle")
            .attr("fill", hc ? fg : (pv > 100 ? t.over : t.unit))
            .style("font-family", SEGOE).style("font-size", "12px").style("font-weight", pv > 100 ? "700" : "600")
            .text(pv > 100 ? `+${Math.round(pv - 100)}% over target` : (ctx.unitText || "of target"));
    }
}
