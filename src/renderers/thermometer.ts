"use strict";

/* ─── Thermometer — linear vertical fill with bulb; scale ticks + labels on
 * the right. The suite's one non-radial instrument. Target/comparison render
 * as tick marks on the linear scale (Decision 2026-07-17).
 * (gallery board g6; viewBox 150×232, track x44 w22 y24–176, bulb cy198 r20) */

import {
    GaugeRenderCtx, galleryTokens, clearGroup, fitTransform, fraction,
    ensureGradients, thermFill, SEGOE, TNUM,
} from "./helpers";

const TOP_Y = 24, BOT_Y = 176, H = BOT_Y - TOP_Y;
const TX = 44, TW = 22, BULB_CY = 198, BULB_R = 20;

export function renderThermometer(ctx: GaugeRenderCtx): void {
    ensureGradients(ctx.defs);
    const t = galleryTokens(ctx.theme);
    // Wider design box than the board's lone thermometer so the value line
    // fits beside it in a PBI tile (board shows value inside the bulb only).
    const g = clearGroup(ctx.group).append("g")
        .attr("transform", fitTransform(ctx, 236, 232));
    const hc = ctx.hc, fg = ctx.hcFg, bg = ctx.hcBg;

    const tf = fraction(ctx, ctx.value);
    const fillH = +(tf * H).toFixed(2), fillY = +(BOT_Y - fillH).toFixed(2);

    g.append("rect").attr("x", TX).attr("y", TOP_Y).attr("width", TW).attr("height", H)
        .attr("rx", TW / 2).attr("fill", hc ? "none" : t.thtrack)
        .attr("stroke", hc ? fg : "none").attr("stroke-width", hc ? 2 : 0);
    if (fillH > 0) {
        g.append("rect").attr("x", TX).attr("y", fillY).attr("width", TW).attr("height", fillH)
            .attr("rx", TW / 2).attr("fill", hc ? fg : thermFill(ctx.theme))
            .style("filter", (!hc && t.glow) ? "drop-shadow(0 0 6px #ff2bd6)" : null);
    }
    g.append("circle").attr("cx", TX + TW / 2).attr("cy", BULB_CY).attr("r", BULB_R)
        .attr("fill", hc ? fg : thermFill(ctx.theme))
        .style("filter", (!hc && t.glow) ? "drop-shadow(0 0 6px #ff2bd6)" : null);

    // Scale ticks + numbers (quarters of the domain)
    for (let i = 0; i <= 4; i++) {
        const y = +(BOT_Y - (i / 4) * H).toFixed(2);
        const v = ctx.min + (ctx.max - ctx.min) * (i / 4);
        g.append("line").attr("x1", TX + TW + 6).attr("y1", y).attr("x2", TX + TW + 14).attr("y2", y)
            .attr("stroke", hc ? fg : t.tick).attr("stroke-width", 2);
        g.append("text").attr("x", TX + TW + 20).attr("y", y)
            .attr("text-anchor", "start").attr("dominant-baseline", "central")
            .attr("fill", hc ? fg : t.unit)
            .style("font-family", SEGOE).style("font-size", "12px").style("font-weight", "600")
            .text(String(Math.round(v * 10) / 10));
    }

    // Target / comparison tick marks across the track
    const tickAt = (v: number, clr: string, w: number) => {
        const y = +(BOT_Y - fraction(ctx, v) * H).toFixed(2);
        g.append("line").attr("x1", TX - 8).attr("y1", y).attr("x2", TX + TW + 8).attr("y2", y)
            .attr("stroke", hc ? fg : clr).attr("stroke-width", w).attr("stroke-linecap", "round");
    };
    if (ctx.target != null) tickAt(ctx.target, t.tgtc, 3);
    if (ctx.comparison != null) tickAt(ctx.comparison, t.unit, 2);

    // Reading in the bulb (board) + big value beside the column
    if (ctx.showValue) {
        g.append("text").attr("x", TX + TW / 2).attr("y", BULB_CY + 6).attr("text-anchor", "middle")
            .attr("fill", hc ? bg : (ctx.theme === "dark" ? "#07071a" : "#ffffff"))
            .style("font-family", SEGOE).style("font-size", "18px")
            .style("font-weight", "700").style("font-feature-settings", TNUM)
            .text(ctx.valueText);
        g.append("text").attr("x", 150).attr("y", 104).attr("text-anchor", "start")
            .attr("fill", hc ? fg : t.val)
            .style("font-family", SEGOE).style("font-size", "30px")
            .style("font-weight", "700").style("font-feature-settings", TNUM)
            .text(ctx.valueText);
        if (ctx.unitText) {
            g.append("text").attr("x", 150).attr("y", 124).attr("text-anchor", "start")
                .attr("fill", hc ? fg : t.unit)
                .style("font-family", SEGOE).style("font-size", "12px")
                .style("font-weight", "600").style("letter-spacing", "0.08em")
                .text(ctx.unitText);
        }
    }
}
