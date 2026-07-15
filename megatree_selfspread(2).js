// ============================================================================
//  MEGATREE  (Self-spreading variant, v3)                  for Sandboxels
//
//  v3 CHANGES
//   - Roots are now TENDRILS: crawling tips that snake sideways/downward
//     through soil, leaving a 1px Mega Fibre strand behind, forking
//     occasionally, and NEVER growing within 1px of another strand — so the
//     root system looks like actual spaced roots, not a blob.
//   - Tree is taller and wider: higher trunk, conical base (thicker at the
//     bottom), and a canopy that keeps filling out over time.
//   - Self-spread unchanged: strand ends can become taproots; mature taproots
//     rarely fire a shoot up to sprout a new tree. gen capped by maxGen.
// ============================================================================

window.MEGATREE_CONFIG = {
    // --- trunk ---
    trunkMin:         60,       // shortest a trunk will grow (pixels)
    trunkMax:         110,      // tallest a trunk will grow (pixels)
    climbChance:      0.12,     // per-tick chance to add one trunk pixel (pace)
    thickenChance:    0.55,     // trunk thickening near the base (conical flare)
    sideBranchChance: 0.5,      // chance the climbing tip throws a side branch
    crownBudget:      24,       // canopy depth: higher = wider / bushier tree
    crownStall:       40,       // if the tip is capped this long, crown out early

    // --- canopy ---
    branchSpread:     0.03,     // per-direction, per-try chance a branch extends
    branchTries:      70,       // how many ticks a branch keeps trying to fill out
    leafRatio:        0.70,     // fraction of new canopy pixels that are leaves

    // --- roots (tendrils) ---
    rootGrowChance:   0.35,     // per-tick chance a tip advances (pace)
    rootLifeMin:      150,      // strand length, in pixels, minimum
    rootLifeMax:      400,      // strand length, maximum (can cross the screen)
    rootBranchChance: 0.03,     // per-advance chance a tip forks a new strand
    rootWiggle:       0.02,     // per-advance chance a tip flips heading

    // --- self-spread ---
    taprootRatio:     0.35,     // chance a finished strand end becomes a taproot
    midTaprootChance: 0.012,    // chance each strand pixel is left as a taproot
    sproutMinAge:     3000,     // taproot must be this old before making a tree
    sproutChance:     0.0006,   // per-tick chance a *mature* taproot fires
    maxGen:           6,        // generations of self-seeding before it stops
};

// ---- small helpers -------------------------------------------------------
function mtIsSoil(el) {
    return eLists.SOIL.indexOf(el) !== -1 || el === "grass" || el === "clay_soil" || el === "color_sand";
}
function mtRootFamily(el) {
    return el === "mega_root" || el === "mega_fiber" || el === "mega_taproot";
}
// Things a shoot is allowed to climb up through.
function mtDiggable(el) {
    return mtIsSoil(el) || mtRootFamily(el);
}
function mtRand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
// True if any pixel within 1 of (tx,ty) — other than `self` — is root-family.
// This is the spacing rule that keeps strands at least 2px apart.
function mtCrowded(tx, ty, self) {
    for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            var x = tx + dx, y = ty + dy;
            if (outOfBounds(x, y)) continue;
            var p = pixelMap[x][y];
            if (!p || p === self) continue;
            if (mtRootFamily(p.element)) return true;
        }
    }
    return false;
}
// Start a new root tip in soil at (x,y). dir = -1/+1, vert = prefers downward.
function mtSeedRootTip(x, y, gen, dir, vert) {
    if (outOfBounds(x, y)) return;
    var p = pixelMap[x][y];
    if (!p || !mtIsSoil(p.element)) return;
    var C = window.MEGATREE_CONFIG;
    changePixel(p, "mega_root");
    p.gen  = gen;
    p.dir  = dir;
    p.vert = vert;
    p.life = mtRand(C.rootLifeMin, C.rootLifeMax);
}

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
        if (pixel.gen       === undefined) pixel.gen       = 0; // hand-placed = gen 0
        if (pixel.rooted    === undefined) pixel.rooted    = false;

        // Fall until it lands on something solid.
        if (tryMove(pixel, pixel.x, pixel.y + 1)) { doDefaults(pixel); return; }

        // Once, on landing: send THREE root tips fanning out into the soil —
        // one left, one right, one straight down.
        if (!pixel.rooted) {
            pixel.rooted = true;
            // Spaced from birth so the tips can't deadlock each other.
            mtSeedRootTip(pixel.x - 2, pixel.y + 1, pixel.gen, -1, false);
            mtSeedRootTip(pixel.x + 2, pixel.y + 1, pixel.gen,  1, false);
            mtSeedRootTip(pixel.x,     pixel.y + 2, pixel.gen, Math.random() < 0.5 ? -1 : 1, true);
        }

        var doneClimbing = (pixel.grown >= pixel.maxHeight);

        if (!doneClimbing) {
            if (isEmpty(pixel.x, pixel.y - 1)) {
                pixel.blocked = 0;
                // Climb up one pixel, leaving trunk behind.
                if (Math.random() < C.climbChance) {
                    movePixel(pixel, pixel.x, pixel.y - 1);
                    createPixel("mega_wood", pixel.x, pixel.y + 1); // fill vacated cell
                    pixel.grown++;

                    // Side branch (skip the lowest section for a clean base).
                    // It SLEEPS until roughly when the trunk finishes, so the
                    // tree shoots up first and then the crown bursts outward.
                    // Higher up = bigger budget -> the crown widens with height.
                    if (pixel.grown > 8 && Math.random() < C.sideBranchChance) {
                        var side = Math.random() < 0.5 ? -1 : 1;
                        if (isEmpty(pixel.x + side, pixel.y + 1)) {
                            createPixel("mega_branch", pixel.x + side, pixel.y + 1);
                            var b = pixelMap[pixel.x + side][pixel.y + 1];
                            if (b) {
                                b.spread = Math.max(3, Math.round(C.crownBudget * pixel.grown / pixel.maxHeight));
                                b.sleep  = Math.round((pixel.maxHeight - pixel.grown) / C.climbChance * 1.3);
                                b.lean   = side; // grow outward as a limb
                            }
                        }
                    }

                    // Conical flare: thicken the trunk sideways, strongly near
                    // the base and tapering to nothing at the top.
                    var flare = C.thickenChance * (1 - pixel.grown / pixel.maxHeight);
                    if (Math.random() < flare && isEmpty(pixel.x - 1, pixel.y + 1)) createPixel("mega_wood", pixel.x - 1, pixel.y + 1);
                    if (Math.random() < flare && isEmpty(pixel.x + 1, pixel.y + 1)) createPixel("mega_wood", pixel.x + 1, pixel.y + 1);
                }
            } else {
                // Capped from above — after a while, just crown out here.
                pixel.blocked = (pixel.blocked || 0) + 1;
                if (pixel.blocked > C.crownStall) doneClimbing = true;
            }
        }

        if (doneClimbing) {
            if (isEmpty(pixel.x, pixel.y - 1)) {
                createPixel("mega_branch", pixel.x, pixel.y - 1);
                var top = pixelMap[pixel.x][pixel.y - 1];
                if (top) top.spread = C.crownBudget;
            }
            changePixel(pixel, "mega_branch");
            pixel.spread = C.crownBudget;
        }

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
//  MEGA BRANCH  — fills the canopy out over time, spending a "spread" budget
// ============================================================================
elements.mega_branch = {
    name: "Mega Branch",
    color: ["#6b3f26", "#5a3420"],
    renderer: renderPresets.WOODCHAR,
    tick: function(pixel) {
        var C = window.MEGATREE_CONFIG;
        if (pixel.start === pixelTicks) { doDefaults(pixel); return; }
        if (pixel.burning)             { doDefaults(pixel); return; }
        if (pixel.sleep > 0)           { pixel.sleep--; doDefaults(pixel); return; }
        if (pixel.spread === undefined) pixel.spread = 0;

        if (pixel.spread > 0) {
            if (pixel.tries === undefined) pixel.tries = C.branchTries;
            var lean = pixel.lean || 0;
            // Leaning branches push OUTWARD (limbs), curling upward.
            // Lean-0 branches (treetop) spread as a broad symmetric crown.
            var dirs = lean === 0
                ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0]]
                : [[lean, 0], [lean, 0], [lean, -1], [0, -1], [-lean, -1]];
            for (var k = 0; k < dirs.length; k++) {
                var nx = pixel.x + dirs[k][0], ny = pixel.y + dirs[k][1];
                if (Math.random() < C.branchSpread && isEmpty(nx, ny)) {
                    // the outward (lean) direction is always limb wood, so
                    // limbs actually extend; leaves fill the other directions
                    var outward = lean !== 0 && dirs[k][0] === lean && dirs[k][1] === 0;
                    if (!outward && Math.random() < C.leafRatio) {
                        createPixel("mega_leaf", nx, ny);
                    } else {
                        createPixel("mega_branch", nx, ny);
                        var b = pixelMap[nx][ny];
                        if (b) { b.spread = pixel.spread - 1; b.lean = lean; }
                    }
                }
            }
            // Keep trying for a while (steady fill-out), then go inert.
            pixel.tries--;
            if (pixel.tries <= 0) pixel.spread = 0;
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
//  MEGA ROOT  — a crawling TENDRIL TIP. Snakes through soil (mostly sideways
//               and down, per its heading), leaves a fibre strand behind,
//               occasionally forks, and never grows within 1px of another
//               strand. When its life runs out or it's boxed in, the tip
//               settles — usually as fibre, sometimes as a live taproot.
// ============================================================================
elements.mega_root = {
    name: "Mega Root",
    color: ["#7a6a52", "#6b5b45", "#8a7860"],
    tick: function(pixel) {
        var C = window.MEGATREE_CONFIG;
        if (pixel.start === pixelTicks) { doDefaults(pixel); return; }
        if (pixel.gen  === undefined) pixel.gen  = 0;
        if (pixel.dir  === undefined) pixel.dir  = Math.random() < 0.5 ? -1 : 1;
        if (pixel.vert === undefined) pixel.vert = false;
        if (pixel.life === undefined) pixel.life = mtRand(C.rootLifeMin, C.rootLifeMax);

        if (Math.random() > C.rootGrowChance) { doDefaults(pixel); return; } // pacing

        // Strand finished?
        if (pixel.life <= 0) {
            changePixel(pixel, Math.random() < C.taprootRatio ? "mega_taproot" : "mega_fiber");
            doDefaults(pixel);
            return;
        }

        // Rare wiggle: flip horizontal heading.
        if (Math.random() < C.rootWiggle) pixel.dir = -pixel.dir;

        // Candidate steps, best-first. Horizontal tips lean sideways+down;
        // vertical tips bore downward.
        var cand;
        if (pixel.vert) {
            cand = [[0, 1], [pixel.dir, 1], [-pixel.dir, 1], [pixel.dir, 0]];
        } else {
            cand = [[pixel.dir, 0], [pixel.dir, 1], [0, 1], [pixel.dir, -1]];
        }

        var moved = false;
        for (var k = 0; k < cand.length; k++) {
            // small chance to skip the preferred step -> organic wobble
            if (k < cand.length - 1 && Math.random() < 0.10) continue;
            var nx = pixel.x + cand[k][0], ny = pixel.y + cand[k][1];
            if (outOfBounds(nx, ny)) continue;
            var np = pixelMap[nx][ny];
            if (!np || !mtIsSoil(np.element)) continue;
            if (mtCrowded(nx, ny, pixel)) continue; // SPACING RULE

            // Advance: target becomes the new tip, we become strand fibre.
            changePixel(np, "mega_root");
            np.gen  = pixel.gen;
            np.dir  = pixel.dir;
            np.vert = pixel.vert;
            np.life = pixel.life - 1;

            // Occasionally fork a fresh strand off the bend we just made.
            if (Math.random() < C.rootBranchChance) {
                var fx = pixel.x + (pixel.vert ? pixel.dir : 0);
                var fy = pixel.y + (pixel.vert ? 0 : 1);
                var fp = !outOfBounds(fx, fy) ? pixelMap[fx][fy] : null;
                if (fp && mtIsSoil(fp.element) && !mtCrowded(fx, fy, pixel)) {
                    changePixel(fp, "mega_root");
                    fp.gen  = pixel.gen;
                    fp.dir  = Math.random() < 0.5 ? pixel.dir : -pixel.dir;
                    fp.vert = !pixel.vert;
                    fp.life = Math.max(20, Math.round(pixel.life * 0.6));
                }
            }

            // Usually leave fibre behind; occasionally a taproot, so sprout
            // points end up scattered all along the strands.
            changePixel(pixel, Math.random() < C.midTaprootChance ? "mega_taproot" : "mega_fiber");
            moved = true;
            break;
        }

        // Boxed in (no valid soil respecting spacing): settle where we are.
        if (!moved) {
            pixel.stuck = (pixel.stuck || 0) + 1;
            if (pixel.stuck > 25) {
                changePixel(pixel, Math.random() < C.taprootRatio ? "mega_taproot" : "mega_fiber");
            }
        }

        doDefaults(pixel);
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
//  MEGA FIBRE  — the strand body the tips leave behind (inert)
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

// ============================================================================
//  MEGA TAPROOT  — a persistent strand end. Once mature (tree long since
//                  fully grown), it VERY rarely fires a shoot straight up,
//                  then spends itself into fibre.
// ============================================================================
elements.mega_taproot = {
    name: "Mega Taproot",
    color: ["#5f5140", "#6b5b45", "#4a3f31"],
    tick: function(pixel) {
        var C = window.MEGATREE_CONFIG;
        if (pixel.gen === undefined) pixel.gen = 0;
        if (pixel.age === undefined) pixel.age = 0;
        pixel.age++;

        if (pixel.age > C.sproutMinAge && pixel.gen < C.maxGen && Math.random() < C.sproutChance) {
            // Same upward sidestep logic as the shoot: up, up-left, up-right.
            var steps = [[0, -1], [-1, -1], [1, -1]];
            if (Math.random() < 0.5) { var tmp = steps[1]; steps[1] = steps[2]; steps[2] = tmp; }
            var done = false;
            for (var k = 0; k < steps.length && !done; k++) {
                var sx = pixel.x + steps[k][0], sy = pixel.y + steps[k][1];
                if (outOfBounds(sx, sy)) continue;
                if (pixelMap[sx][sy] === undefined) {
                    createPixel("mega_sapling", sx, sy);
                    var sp = pixelMap[sx][sy];
                    if (sp) sp.gen = pixel.gen + 1;
                    changePixel(pixel, "mega_fiber"); // spent
                    done = true;
                }
            }
            for (var k = 0; k < steps.length && !done; k++) {
                var sx = pixel.x + steps[k][0], sy = pixel.y + steps[k][1];
                if (outOfBounds(sx, sy)) continue;
                var ap = pixelMap[sx][sy];
                if (ap && mtDiggable(ap.element)) {
                    changePixel(ap, "mega_shoot");
                    ap.gen = pixel.gen + 1;
                    changePixel(pixel, "mega_fiber"); // spent
                    done = true;
                }
            }
            // if fully boxed in by rock/wood: stay a taproot, try again later
        }
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
//  MEGA SHOOT  — climbs straight up through soil/roots (one pixel per frame),
//                leaving a fibre trail, sprouting a Mega Sapling in open air.
// ============================================================================
elements.mega_shoot = {
    name: "Mega Shoot",
    color: ["#8a7860", "#6b5b45"],
    tick: function(pixel) {
        if (pixel.start === pixelTicks) { doDefaults(pixel); return; }
        if (pixel.gen === undefined) pixel.gen = 1;

        var ax = pixel.x, ay = pixel.y - 1;

        if (outOfBounds(ax, ay)) {
            changePixel(pixel, "mega_sapling");
            doDefaults(pixel);
            return;
        }

        // Try up, then up-left / up-right — a shoot can sidestep around
        // obstructions (e.g. the trunk above it) while always heading upward.
        var steps = [[0, -1], [-1, -1], [1, -1]];
        if (Math.random() < 0.5) { var tmp = steps[1]; steps[1] = steps[2]; steps[2] = tmp; }

        var done = false;
        // First preference: any open-air cell -> sprout the new tree.
        for (var k = 0; k < steps.length && !done; k++) {
            var sx = pixel.x + steps[k][0], sy = pixel.y + steps[k][1];
            if (outOfBounds(sx, sy)) continue;
            if (pixelMap[sx][sy] === undefined) {
                createPixel("mega_sapling", sx, sy);
                var sp = pixelMap[sx][sy];
                if (sp) sp.gen = pixel.gen;
                changePixel(pixel, "mega_fiber");
                done = true;
            }
        }
        // Otherwise: dig through the first diggable cell.
        for (var k = 0; k < steps.length && !done; k++) {
            var sx = pixel.x + steps[k][0], sy = pixel.y + steps[k][1];
            if (outOfBounds(sx, sy)) continue;
            var ap2 = pixelMap[sx][sy];
            if (ap2 && mtDiggable(ap2.element)) {
                changePixel(ap2, "mega_shoot");
                ap2.gen = pixel.gen;
                changePixel(pixel, "mega_fiber");
                done = true;
            }
        }
        if (!done) changePixel(pixel, "mega_fiber"); // fully boxed in — give up

        doDefaults(pixel);
    },
    category: "life",
    state: "solid",
    density: 1250,
    movable: false,
    hidden: true,
};

// ############################################################################
// #####################        ULTRA  TREE        ###########################
// ############################################################################
//  The apex predator variant. Place an "Ultra Sapling":
//   - Faster, taller, thicker everything.
//   - Roots are 2px-thick strands that pierce ALL natural ground — dirt,
//     sand, gravel, clay, rock, basalt, limestone, snow... The limit: they
//     cannot break man-made material (concrete, brick, baked clay, walls).
//   - Roots CONNECT: they dig straight through vanilla and Mega root
//     networks, fusing them into the ultra network as they pass.
//   - CORRUPTION: anything ultra converts adjacent plant matter — vanilla
//     trees, plants, saplings, roots, and whole Megatrees — into ultra.
// ============================================================================

window.ULTRATREE_CONFIG = {
    trunkMin:         80,
    trunkMax:         140,
    climbChance:      0.25,     // roughly twice mega growth speed
    thickenChance:    0.7,
    sideBranchChance: 0.55,
    crownBudget:      30,
    crownStall:       40,

    branchSpread:     0.035,
    branchTries:      80,
    leafRatio:        0.68,

    rootGrowChance:   0.6,
    rootLifeMin:      200,
    rootLifeMax:      500,
    rootBranchChance: 0.04,
    rootWiggle:       0.02,

    midTaprootChance: 0.015,
    taprootRatio:     0.4,
    sproutMinAge:     1200,     // matures much faster than mega
    sproutChance:     0.002,
    maxGen:           12,
};

// Natural ground the ultra roots can pierce. The limit is man-made material:
// concrete, brick, baked clay, walls, metal, glass all stop them.
var UT_GROUND = ["dirt","mud","sand","wet_sand","packed_sand","gravel","clay",
    "clay_soil","mycelium","mulch","mudstone","permafrost","snow","packed_snow",
    "tuff","limestone","rock","basalt","grass","color_sand"];
function utIsGround(el) { return UT_GROUND.indexOf(el) !== -1; }
function utRootFamily(el) {
    return el === "ultra_root" || el === "ultra_fiber" || el === "ultra_taproot";
}
// Networks the ultra roots fuse with (converted to ultra as they pass).
function utFusable(el) {
    return el === "root" || el === "fiber" ||
           el === "mega_root" || el === "mega_fiber" || el === "mega_taproot";
}
function utDiggable(el) { return utIsGround(el) || utRootFamily(el) || utFusable(el); }
// Softer crowding than mega: an ultra tip tolerates ONE ultra neighbour at
// its target (its own 2px-thick body), so strands stay strand-like but can
// touch and join at corners.
function utCrowdCount(tx, ty, self) {
    var n = 0;
    for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            var x = tx + dx, y = ty + dy;
            if (outOfBounds(x, y)) continue;
            var p = pixelMap[x][y];
            if (!p || p === self) continue;
            if (utRootFamily(p.element)) n++;
        }
    }
    return n;
}
function utSeedRootTip(x, y, gen, dir, vert) {
    if (outOfBounds(x, y)) return;
    var p = pixelMap[x][y];
    if (!p || !utDiggable(p.element)) return;
    var C = window.ULTRATREE_CONFIG;
    changePixel(p, "ultra_root");
    p.gen  = gen;
    p.dir  = dir;
    p.vert = vert;
    p.life = mtRand(C.rootLifeMin, C.rootLifeMax);
}

// Corruption map: what each touched thing becomes. Shared by the reactions
// of every surface ultra element.
var UT_CORRUPT = {
    "sapling":      { elem2: "ultra_sapling", chance: 0.1 },
    "mega_sapling": { elem2: "ultra_sapling", chance: 0.1 },
    "wood":         { elem2: "ultra_wood",    chance: 0.08 },
    "mega_wood":    { elem2: "ultra_wood",    chance: 0.08 },
    "tree_branch":  { elem2: "ultra_branch",  chance: 0.08 },
    "mega_branch":  { elem2: "ultra_branch",  chance: 0.08 },
    "plant":        { elem2: "ultra_leaf",    chance: 0.08 },
    "mega_leaf":    { elem2: "ultra_leaf",    chance: 0.08 },
    "grass":        { elem2: "ultra_leaf",    chance: 0.05 },
    "vine":         { elem2: "ultra_leaf",    chance: 0.05 },
    "root":         { elem2: "ultra_fiber",   chance: 0.08 },
    "fiber":        { elem2: "ultra_fiber",   chance: 0.08 },
    "mega_root":    { elem2: "ultra_fiber",   chance: 0.08 },
    "mega_fiber":   { elem2: "ultra_fiber",   chance: 0.08 },
    "mega_taproot": { elem2: "ultra_taproot", chance: 0.08 },
    "seeds":        { elem2: "ultra_sapling", chance: 0.02 },
};

// ============================================================================
//  ULTRA SAPLING
// ============================================================================
elements.ultra_sapling = {
    name: "Ultra Sapling",
    color: ["#7a2fb5", "#9440d6", "#6d28a8"],
    tick: function(pixel) {
        var C = window.ULTRATREE_CONFIG;
        if (pixel.grown     === undefined) pixel.grown     = 0;
        if (pixel.maxHeight === undefined) pixel.maxHeight = mtRand(C.trunkMin, C.trunkMax);
        if (pixel.gen       === undefined) pixel.gen       = 0;
        if (pixel.rooted    === undefined) pixel.rooted    = false;

        if (tryMove(pixel, pixel.x, pixel.y + 1)) { doDefaults(pixel); return; }

        if (!pixel.rooted) {
            pixel.rooted = true;
            utSeedRootTip(pixel.x - 2, pixel.y + 1, pixel.gen, -1, false);
            utSeedRootTip(pixel.x + 2, pixel.y + 1, pixel.gen,  1, false);
            utSeedRootTip(pixel.x,     pixel.y + 2, pixel.gen, Math.random() < 0.5 ? -1 : 1, true);
        }

        var doneClimbing = (pixel.grown >= pixel.maxHeight);

        if (!doneClimbing) {
            if (isEmpty(pixel.x, pixel.y - 1)) {
                pixel.blocked = 0;
                if (Math.random() < C.climbChance) {
                    movePixel(pixel, pixel.x, pixel.y - 1);
                    createPixel("ultra_wood", pixel.x, pixel.y + 1);
                    pixel.grown++;

                    if (pixel.grown > 8 && Math.random() < C.sideBranchChance) {
                        var side = Math.random() < 0.5 ? -1 : 1;
                        if (isEmpty(pixel.x + side, pixel.y + 1)) {
                            createPixel("ultra_branch", pixel.x + side, pixel.y + 1);
                            var b = pixelMap[pixel.x + side][pixel.y + 1];
                            if (b) {
                                b.spread = Math.max(3, Math.round(C.crownBudget * pixel.grown / pixel.maxHeight));
                                b.sleep  = Math.round((pixel.maxHeight - pixel.grown) / C.climbChance * 1.3);
                                b.lean   = side;
                            }
                        }
                    }

                    var flare = C.thickenChance * (1 - pixel.grown / pixel.maxHeight);
                    if (Math.random() < flare && isEmpty(pixel.x - 1, pixel.y + 1)) createPixel("ultra_wood", pixel.x - 1, pixel.y + 1);
                    if (Math.random() < flare && isEmpty(pixel.x + 1, pixel.y + 1)) createPixel("ultra_wood", pixel.x + 1, pixel.y + 1);
                }
            } else {
                pixel.blocked = (pixel.blocked || 0) + 1;
                if (pixel.blocked > C.crownStall) doneClimbing = true;
            }
        }

        if (doneClimbing) {
            if (isEmpty(pixel.x, pixel.y - 1)) {
                createPixel("ultra_branch", pixel.x, pixel.y - 1);
                var top = pixelMap[pixel.x][pixel.y - 1];
                if (top) top.spread = C.crownBudget;
            }
            changePixel(pixel, "ultra_branch");
            pixel.spread = C.crownBudget;
        }

        doDefaults(pixel);
    },
    reactions: UT_CORRUPT,
    tempHigh: 150,
    stateHigh: "dead_plant",
    tempLow: -30,
    stateLow: "frozen_plant",
    burn: 30,
    burnTime: 40,
    category: "life",
    state: "solid",
    density: 1800,
    hardness: 0.5,
};

// ============================================================================
//  ULTRA WOOD / BRANCH / LEAF
// ============================================================================
elements.ultra_wood = {
    name: "Ultra Wood",
    color: ["#3a2438", "#2e1c2e", "#472a45"],
    behavior: behaviors.WALL,
    renderer: renderPresets.WOODCHAR,
    reactions: UT_CORRUPT,
    tempHigh: 600,
    stateHigh: "ember",
    burn: 2,
    burnTime: 700,
    burnInto: ["sap", "ember", "charcoal", "smoke"],
    breakInto: "sawdust",
    category: "life",
    state: "solid",
    density: 2000,
    hardness: 0.6,
    movable: false,
    hidden: true,
};

elements.ultra_branch = {
    name: "Ultra Branch",
    color: ["#3a2438", "#2e1c2e"],
    renderer: renderPresets.WOODCHAR,
    tick: function(pixel) {
        var C = window.ULTRATREE_CONFIG;
        if (pixel.start === pixelTicks) { doDefaults(pixel); return; }
        if (pixel.burning)             { doDefaults(pixel); return; }
        if (pixel.sleep > 0)           { pixel.sleep--; doDefaults(pixel); return; }
        // A branch with no assigned budget was CONVERTED from another tree —
        // give it a small burst so corrupted trees sprout ultra growth.
        if (pixel.spread === undefined) pixel.spread = 4;

        if (pixel.spread > 0) {
            if (pixel.tries === undefined) pixel.tries = C.branchTries;
            var lean = pixel.lean || 0;
            var dirs = lean === 0
                ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0]]
                : [[lean, 0], [lean, 0], [lean, -1], [0, -1], [-lean, -1]];
            for (var k = 0; k < dirs.length; k++) {
                var nx = pixel.x + dirs[k][0], ny = pixel.y + dirs[k][1];
                if (Math.random() < C.branchSpread && isEmpty(nx, ny)) {
                    var outward = lean !== 0 && dirs[k][0] === lean && dirs[k][1] === 0;
                    if (!outward && Math.random() < C.leafRatio) {
                        createPixel("ultra_leaf", nx, ny);
                    } else {
                        createPixel("ultra_branch", nx, ny);
                        var b = pixelMap[nx][ny];
                        if (b) { b.spread = pixel.spread - 1; b.lean = lean; }
                    }
                }
            }
            pixel.tries--;
            if (pixel.tries <= 0) pixel.spread = 0;
        }
        doDefaults(pixel);
    },
    reactions: UT_CORRUPT,
    tempHigh: 150,
    stateHigh: "ultra_wood",
    tempLow: -60,
    stateLow: "ultra_wood",
    burn: 2,
    burnTime: 500,
    burnInto: ["sap", "ember", "charcoal", "smoke"],
    breakInto: ["sap", "sawdust"],
    category: "life",
    state: "solid",
    density: 1900,
    hardness: 0.4,
    movable: false,
    hidden: true,
};

elements.ultra_leaf = {
    name: "Ultra Leaf",
    color: ["#b03060", "#c2417a", "#8e2455", "#d15a92"],
    behavior: behaviors.WALL,
    reactions: Object.assign({
        "carbon_dioxide": { elem1: "ultra_leaf", elem2: "oxygen", chance: 0.08 },
    }, UT_CORRUPT),
    tempHigh: 150,
    stateHigh: "dead_plant",
    tempLow: -40,
    stateLow: "frozen_plant",
    burn: 15,
    burnTime: 100,
    burnInto: ["ash", "smoke"],
    breakInto: "dead_plant",
    category: "life",
    state: "solid",
    density: 300,
    movable: false,
    hidden: true,
};

// ============================================================================
//  ULTRA ROOT  — thick tendril tip. Pierces all natural ground, fuses with
//                other root networks, tolerates touching its own body.
// ============================================================================
elements.ultra_root = {
    name: "Ultra Root",
    color: ["#c9b8d8", "#b5a3c9", "#9d87b3"],
    tick: function(pixel) {
        var C = window.ULTRATREE_CONFIG;
        if (pixel.start === pixelTicks) { doDefaults(pixel); return; }
        if (pixel.gen  === undefined) pixel.gen  = 0;
        if (pixel.dir  === undefined) pixel.dir  = Math.random() < 0.5 ? -1 : 1;
        if (pixel.vert === undefined) pixel.vert = false;
        if (pixel.life === undefined) pixel.life = mtRand(C.rootLifeMin, C.rootLifeMax);

        if (Math.random() > C.rootGrowChance) { doDefaults(pixel); return; }

        if (pixel.life <= 0) {
            changePixel(pixel, Math.random() < C.taprootRatio ? "ultra_taproot" : "ultra_fiber");
            doDefaults(pixel);
            return;
        }

        if (Math.random() < C.rootWiggle) pixel.dir = -pixel.dir;

        var cand;
        if (pixel.vert) {
            cand = [[0, 1], [pixel.dir, 1], [-pixel.dir, 1], [pixel.dir, 0]];
        } else {
            cand = [[pixel.dir, 0], [pixel.dir, 1], [0, 1], [pixel.dir, -1]];
        }

        var moved = false;
        for (var k = 0; k < cand.length; k++) {
            if (k < cand.length - 1 && Math.random() < 0.10) continue;
            var nx = pixel.x + cand[k][0], ny = pixel.y + cand[k][1];
            if (outOfBounds(nx, ny)) continue;
            var np = pixelMap[nx][ny];
            if (!np || !utDiggable(np.element)) continue;
            if (utCrowdCount(nx, ny, pixel) > 1) continue; // tolerant spacing

            changePixel(np, "ultra_root");
            np.gen  = pixel.gen;
            np.dir  = pixel.dir;
            np.vert = pixel.vert;
            np.life = pixel.life - 1;

            if (Math.random() < C.rootBranchChance) {
                var fx = pixel.x + (pixel.vert ? pixel.dir : 0);
                var fy = pixel.y + (pixel.vert ? 0 : 1);
                var fp = !outOfBounds(fx, fy) ? pixelMap[fx][fy] : null;
                if (fp && utDiggable(fp.element) && utCrowdCount(fx, fy, pixel) <= 1) {
                    changePixel(fp, "ultra_root");
                    fp.gen  = pixel.gen;
                    fp.dir  = Math.random() < 0.5 ? pixel.dir : -pixel.dir;
                    fp.vert = !pixel.vert;
                    fp.life = Math.max(30, Math.round(pixel.life * 0.6));
                }
            }

            // Body: the vacated cell becomes fibre (occasionally a taproot)...
            changePixel(pixel, Math.random() < C.midTaprootChance ? "ultra_taproot" : "ultra_fiber");
            // ...and THICKNESS: also fibre-ize one diggable cell beside it.
            var ty = pixel.y + 1, tp = !outOfBounds(pixel.x, ty) ? pixelMap[pixel.x][ty] : null;
            if (!tp || !utDiggable(tp.element)) { ty = pixel.y - 1; tp = !outOfBounds(pixel.x, ty) ? pixelMap[pixel.x][ty] : null; }
            if (tp && utDiggable(tp.element) && !utRootFamily(tp.element)) changePixel(tp, "ultra_fiber");

            moved = true;
            break;
        }

        if (!moved) {
            pixel.stuck = (pixel.stuck || 0) + 1;
            if (pixel.stuck > 25) {
                changePixel(pixel, Math.random() < C.taprootRatio ? "ultra_taproot" : "ultra_fiber");
            }
        }

        doDefaults(pixel);
    },
    reactions: UT_CORRUPT,
    tempHigh: 500,
    stateHigh: "dirt",
    tempLow: -80,
    stateLow: "ultra_fiber",
    burn: 5,
    burnTime: 100,
    burnInto: "dirt",
    category: "life",
    state: "solid",
    density: 1600,
    conduct: 0.1,
    movable: false,
    hidden: true,
};

// ============================================================================
//  ULTRA FIBRE  — the thick strand body; also corrupts what it touches
// ============================================================================
elements.ultra_fiber = {
    name: "Ultra Fibre",
    color: ["#b5a3c9", "#a794bd", "#8f7aa6"],
    behavior: behaviors.STURDYPOWDER,
    reactions: UT_CORRUPT,
    tempHigh: 500,
    stateHigh: "dirt",
    tempLow: -80,
    stateLow: "permafrost",
    burn: 5,
    burnTime: 100,
    burnInto: "dirt",
    breakInto: "tinder",
    category: "life",
    state: "solid",
    density: 900,
    hidden: true,
};

// ============================================================================
//  ULTRA TAPROOT + ULTRA SHOOT  — the (faster) self-spread machinery
// ============================================================================
elements.ultra_taproot = {
    name: "Ultra Taproot",
    color: ["#7d6a94", "#6b5b82", "#594a70"],
    tick: function(pixel) {
        var C = window.ULTRATREE_CONFIG;
        if (pixel.gen === undefined) pixel.gen = 0;
        if (pixel.age === undefined) pixel.age = 0;
        pixel.age++;

        if (pixel.age > C.sproutMinAge && pixel.gen < C.maxGen && Math.random() < C.sproutChance) {
            var steps = [[0, -1], [-1, -1], [1, -1]];
            if (Math.random() < 0.5) { var tmp = steps[1]; steps[1] = steps[2]; steps[2] = tmp; }
            var done = false;
            for (var k = 0; k < steps.length && !done; k++) {
                var sx = pixel.x + steps[k][0], sy = pixel.y + steps[k][1];
                if (outOfBounds(sx, sy)) continue;
                if (pixelMap[sx][sy] === undefined) {
                    createPixel("ultra_sapling", sx, sy);
                    var sp = pixelMap[sx][sy];
                    if (sp) sp.gen = pixel.gen + 1;
                    changePixel(pixel, "ultra_fiber");
                    done = true;
                }
            }
            for (var k = 0; k < steps.length && !done; k++) {
                var sx = pixel.x + steps[k][0], sy = pixel.y + steps[k][1];
                if (outOfBounds(sx, sy)) continue;
                var ap = pixelMap[sx][sy];
                if (ap && utDiggable(ap.element)) {
                    changePixel(ap, "ultra_shoot");
                    ap.gen = pixel.gen + 1;
                    changePixel(pixel, "ultra_fiber");
                    done = true;
                }
            }
        }
        doDefaults(pixel);
    },
    reactions: UT_CORRUPT,
    tempHigh: 500,
    stateHigh: "dirt",
    tempLow: -80,
    stateLow: "ultra_fiber",
    burn: 5,
    burnTime: 100,
    burnInto: "dirt",
    category: "life",
    state: "solid",
    density: 1600,
    conduct: 0.1,
    movable: false,
    hidden: true,
};

elements.ultra_shoot = {
    name: "Ultra Shoot",
    color: ["#c9b8d8", "#9d87b3"],
    tick: function(pixel) {
        if (pixel.start === pixelTicks) { doDefaults(pixel); return; }
        if (pixel.gen === undefined) pixel.gen = 1;

        if (outOfBounds(pixel.x, pixel.y - 1)) {
            changePixel(pixel, "ultra_sapling");
            doDefaults(pixel);
            return;
        }

        var steps = [[0, -1], [-1, -1], [1, -1]];
        if (Math.random() < 0.5) { var tmp = steps[1]; steps[1] = steps[2]; steps[2] = tmp; }

        var done = false;
        for (var k = 0; k < steps.length && !done; k++) {
            var sx = pixel.x + steps[k][0], sy = pixel.y + steps[k][1];
            if (outOfBounds(sx, sy)) continue;
            if (pixelMap[sx][sy] === undefined) {
                createPixel("ultra_sapling", sx, sy);
                var sp = pixelMap[sx][sy];
                if (sp) sp.gen = pixel.gen;
                changePixel(pixel, "ultra_fiber");
                done = true;
            }
        }
        for (var k = 0; k < steps.length && !done; k++) {
            var sx = pixel.x + steps[k][0], sy = pixel.y + steps[k][1];
            if (outOfBounds(sx, sy)) continue;
            var ap = pixelMap[sx][sy];
            if (ap && utDiggable(ap.element)) {
                changePixel(ap, "ultra_shoot");
                ap.gen = pixel.gen;
                changePixel(pixel, "ultra_fiber");
                done = true;
            }
        }
        if (!done) changePixel(pixel, "ultra_fiber");

        doDefaults(pixel);
    },
    category: "life",
    state: "solid",
    density: 1600,
    movable: false,
    hidden: true,
};

// ============================================================================
//  LIVE-INJECT FOOTER — makes this file safe to paste straight into the
//  browser console (F12) on an already-running game. When loaded normally
//  as a mod (before boot), this does nothing.
// ============================================================================
(function() {
    try {
        var booted = typeof elements === "object" && elements.dirt && elements.dirt.colorObject !== undefined;
        if (!booted) return;
        var megas = ["mega_sapling","mega_wood","mega_branch","mega_leaf","mega_root","mega_fiber","mega_taproot","mega_shoot","ultra_sapling","ultra_wood","ultra_branch","ultra_leaf","ultra_root","ultra_fiber","ultra_taproot","ultra_shoot"];
        for (var i = 0; i < megas.length; i++) {
            var k = megas[i];
            if (!elements[k] || elements[k].colorObject !== undefined) continue;
            finalizeColor(elements[k]);
            checkAutoGen(k, elements[k]);
            finalizeElementAfter(k);
            if (!elements[k].hidden) {
                createElementButton(k);
                elementCount++;
            } else {
                hiddenCount++;
            }
        }
        if (typeof promptText === "function") promptText("Megatree injected! Find Mega Sapling and Ultra Sapling in the Life category.", undefined, "Megatree");
        console.log("[megatree] live-injected successfully");
    } catch (e) {
        console.log("[megatree] live-inject skipped/failed:", e.message);
    }
})();
