// ============================================================================
//  MEGATREE  (Phase 1 — the tree only)                    for Sandboxels
//  Built on the vanilla sapling / tree_branch / root / fiber systems.
//
//  WHAT IT DOES
//   1. Place ONE "Mega Sapling" on soil (dirt, sand, grass, mud, clay...).
//   2. It climbs upward like a normal sapling, but MUCH taller, laying a
//      trunk of Mega Wood and throwing out Mega Branch crowns. The higher it
//      climbs the bigger those crowns are, so the tree gets steadily WIDER
//      as it grows — capped by a "crown budget" so it eventually stops.
//   3. Underground it seeds a Mega Root, which creeps SIDEWAYS and down
//      through soil — potentially crossing the whole screen if there's enough
//      dirt — leaving Mega Fibre behind as it settles.
//
//  NOT in this phase: roots do NOT sprout new trees yet. That's the next
//  variant. The single hook where it will plug in is marked "PHASE 2 HOOK".
//
//  Tune everything in the CONFIG block below, then reload the game.
// ============================================================================

window.MEGATREE_CONFIG = {
    trunkMin:         45,       // shortest a trunk will grow (pixels)
    trunkMax:         80,       // tallest a trunk will grow (pixels)
    climbChance:      0.10,     // per-tick chance to add one trunk pixel (pace)
    sideBranchChance: 0.55,     // chance the climbing tip throws a side branch
    crownBudget:      16,       // canopy size: higher = wider / bushier tree
    crownStall:       40,       // if the tip is capped by its own canopy this long, crown out

    branchSpread:     0.04,     // per-direction chance a branch extends
    leafRatio:        0.70,     // fraction of new canopy pixels that are leaves

    rootSpreadChance: 0.06,     // per-neighbour chance a root eats adjacent soil
    rootFiberRatio:   0.18,     // chance eaten soil becomes fibre instead of root
    rootSettleAfter:  8,        // ticks with no soil left nearby -> root goes dormant (fibre)
};

// ---- small helpers -------------------------------------------------------
function mtIsSoil(el) {
    return eLists.SOIL.indexOf(el) !== -1 || el === "grass" || el === "clay_soil" || el === "color_sand";
}
function mtRand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

// ============================================================================
//  MEGA SAPLING  — the only element you place by hand
// ============================================================================
elements.mega_sapling = {
    name: "Mega Sapling",
    color: ["#2f7d2f", "#3e9c3e", "#357f35"],
    tick: function(pixel) {
        var C = window.MEGATREE_CONFIG;
        if (pixel.grown     === undefined) pixel.grown     = 0;
        if (pixel.maxHeight === undefined) pixel.maxHeight = mtRand(C.trunkMin, C.trunkMax);
        if (pixel.age       === undefined) pixel.age       = 0;

        // Fall until it lands on something solid.
        if (tryMove(pixel, pixel.x, pixel.y + 1)) {
            pixel.age++;
            doDefaults(pixel);
            return;
        }

        // Turn the soil directly beneath into a root (seeds the network).
        if (!outOfBounds(pixel.x, pixel.y + 1)) {
            var below = pixelMap[pixel.x][pixel.y + 1];
            if (below && mtIsSoil(below.element)) {
                changePixel(below, "mega_root");
                below.still = 0;
            }
        }

        var doneClimbing = (pixel.grown >= pixel.maxHeight);

        if (!doneClimbing) {
            if (isEmpty(pixel.x, pixel.y - 1)) {
                pixel.blocked = 0;
                // Climb up one pixel, leaving trunk (and sometimes a side branch).
                if (Math.random() < C.climbChance) {
                    movePixel(pixel, pixel.x, pixel.y - 1);
                    createPixel("mega_wood", pixel.x, pixel.y + 1); // fill vacated cell
                    pixel.grown++;

                    // Side branch, started one row BELOW the tip so it can't cap
                    // the trunk. Higher up = bigger crown -> tapered shape.
                    if (Math.random() < C.sideBranchChance) {
                        var side = Math.random() < 0.5 ? -1 : 1;
                        if (isEmpty(pixel.x + side, pixel.y + 1)) {
                            createPixel("mega_branch", pixel.x + side, pixel.y + 1);
                            var b = pixelMap[pixel.x + side][pixel.y + 1];
                            if (b) b.spread = Math.max(2, Math.round(C.crownBudget * pixel.grown / pixel.maxHeight));
                        }
                    }
                }
            } else {
                // Capped from above (usually by our own canopy). Don't sit here
                // forever — after a while, just crown out where we are.
                pixel.blocked = (pixel.blocked || 0) + 1;
                if (pixel.blocked > C.crownStall) doneClimbing = true;
            }
        }

        if (doneClimbing) {
            // Crown the top and stop being a sapling.
            if (isEmpty(pixel.x, pixel.y - 1)) {
                createPixel("mega_branch", pixel.x, pixel.y - 1);
                var top = pixelMap[pixel.x][pixel.y - 1];
                if (top) top.spread = C.crownBudget;
            }
            changePixel(pixel, "mega_branch");
            pixel.spread = C.crownBudget;
        }

        pixel.age++;
        doDefaults(pixel);
    },
    tempHigh: 100,
    stateHigh: "dead_plant",
    tempLow: -2,
    stateLow: "frozen_plant",
    burn: 65,
    burnTime: 15,
    category: "life",
    state: "solid",
    density: 1500,
    hardness: 0.3,
};

// ============================================================================
//  MEGA WOOD  — the trunk (inert, flammable, choppable)
// ============================================================================
elements.mega_wood = {
    name: "Mega Wood",
    color: ["#6b3f26", "#5a3420", "#7a4a2e"],
    behavior: behaviors.WALL,
    renderer: renderPresets.WOODCHAR,
    tempHigh: 400,
    stateHigh: "ember",
    burn: 8,
    burnTime: 400,
    burnInto: ["sap", "ember", "charcoal", "smoke"],
    breakInto: "sawdust",
    category: "life",
    state: "solid",
    density: 1600,
    hardness: 0.25,
    movable: false,
    hidden: true,
};

// ============================================================================
//  MEGA BRANCH  — builds the wide canopy, spends a "spread" budget
// ============================================================================
elements.mega_branch = {
    name: "Mega Branch",
    color: ["#6b3f26", "#5a3420"],
    renderer: renderPresets.WOODCHAR,
    tick: function(pixel) {
        var C = window.MEGATREE_CONFIG;
        if (pixel.start === pixelTicks) { doDefaults(pixel); return; } // settle one frame
        if (pixel.burning)             { doDefaults(pixel); return; }
        if (pixel.spread === undefined) pixel.spread = 0;

        if (pixel.spread > 0) {
            // up-left, up, up-right, left, right  -> broad crown
            var dirs = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0]];
            for (var k = 0; k < dirs.length; k++) {
                var nx = pixel.x + dirs[k][0], ny = pixel.y + dirs[k][1];
                if (Math.random() < C.branchSpread && isEmpty(nx, ny)) {
                    if (Math.random() < C.leafRatio) {
                        createPixel("mega_leaf", nx, ny);
                    } else {
                        createPixel("mega_branch", nx, ny);
                        var b = pixelMap[nx][ny];
                        if (b) b.spread = pixel.spread - 1;
                    }
                }
            }
        }
        doDefaults(pixel);
    },
    tempHigh: 100,
    stateHigh: "mega_wood",
    tempLow: -30,
    stateLow: "mega_wood",
    burn: 4,
    burnTime: 300,
    burnInto: ["sap", "ember", "charcoal", "smoke"],
    breakInto: ["sap", "sawdust"],
    category: "life",
    state: "solid",
    density: 1500,
    hardness: 0.15,
    movable: false,
    hidden: true,
};

// ============================================================================
//  MEGA LEAF  — the foliage
// ============================================================================
elements.mega_leaf = {
    name: "Mega Leaf",
    color: ["#1f8f3a", "#26a344", "#2fbf57", "#3aa85e"],
    behavior: behaviors.WALL,
    reactions: {
        "carbon_dioxide": { elem1: "mega_leaf", elem2: "oxygen", chance: 0.05 },
    },
    tempHigh: 100,
    stateHigh: "dead_plant",
    tempLow: -20,
    stateLow: "frozen_plant",
    burn: 40,
    burnTime: 60,
    burnInto: ["ash", "smoke"],
    breakInto: "dead_plant",
    category: "life",
    state: "solid",
    density: 240,
    movable: false,
    hidden: true,
};

// ============================================================================
//  MEGA ROOT  — creeps sideways + down through soil, leaving fibre, then
//               goes dormant when there's no more soil to eat nearby.
// ============================================================================
elements.mega_root = {
    name: "Mega Root",
    color: ["#7a6a52", "#6b5b45", "#8a7860"],
    tick: function(pixel) {
        var C = window.MEGATREE_CONFIG;
        if (pixel.start === pixelTicks) { doDefaults(pixel); return; } // ~1 ring/frame
        if (pixel.still === undefined) pixel.still = 0;

        var t = [[-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1]]; // left, right, down, down-diag
        var ate = false;
        for (var k = 0; k < t.length; k++) {
            if (Math.random() < C.rootSpreadChance) {
                var nx = pixel.x + t[k][0], ny = pixel.y + t[k][1];
                if (!outOfBounds(nx, ny)) {
                    var np = pixelMap[nx][ny];
                    if (np && mtIsSoil(np.element)) {
                        ate = true;
                        if (Math.random() < C.rootFiberRatio) {
                            changePixel(np, "mega_fiber");
                        } else {
                            changePixel(np, "mega_root");
                            np.still = 0;
                        }
                    }
                }
            }
        }

        // Settle: if there's no soil at all around us, stop ticking forever and
        // become fibre. The advancing frontier (which still touches soil) stays
        // active, so the network keeps reaching outward until dirt runs out.
        var soilNear = false;
        for (var dx = -1; dx <= 1 && !soilNear; dx++) {
            for (var dy = -1; dy <= 1; dy++) {
                if (!outOfBounds(pixel.x + dx, pixel.y + dy)) {
                    var q = pixelMap[pixel.x + dx][pixel.y + dy];
                    if (q && mtIsSoil(q.element)) { soilNear = true; break; }
                }
            }
        }
        if (!soilNear && !ate) {
            pixel.still++;
            if (pixel.still > C.rootSettleAfter) changePixel(pixel, "mega_fiber");
        } else {
            pixel.still = 0;
        }

        // PHASE 2 HOOK: here is where a mature root will (very rarely) send a
        // shoot up through the ground to sprout a brand-new Mega Sapling.

        doDefaults(pixel);
    },
    reactions: {
        "water":       { elem2: null, chance: 0.004 },
        "sugar_water": { elem2: null, chance: 0.006 },
    },
    tempHigh: 275,
    stateHigh: "dirt",
    tempLow: -50,
    stateLow: "mega_fiber",
    burn: 20,
    burnTime: 60,
    burnInto: "dirt",
    category: "life",
    state: "solid",
    density: 1250,
    conduct: 0.1,
    movable: false,
    hidden: true,
};

// ============================================================================
//  MEGA FIBRE  — the settled root body / byproduct
// ============================================================================
elements.mega_fiber = {
    name: "Mega Fibre",
    color: ["#6b563e", "#5c553e", "#42342d"],
    behavior: behaviors.STURDYPOWDER,
    tempHigh: 275,
    stateHigh: "dirt",
    tempLow: -50,
    stateLow: "permafrost",
    burn: 20,
    burnTime: 60,
    burnInto: "dirt",
    breakInto: "tinder",
    category: "life",
    state: "solid",
    density: 462,
    hidden: true,
};
