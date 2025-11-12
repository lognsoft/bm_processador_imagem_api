# Image Filters – Sharp Pipeline

Each operator implements an **image filter** using the [Sharp](https://sharp.pixelplumbing.com/api-operation/) library — a high-performance image processing toolkit for Node.js.

Each function receives and returns a `Sharp` instance, allowing chaining within the processing pipeline.

---

## `bw` — Black & White Channel Mixer
[Sharp Docs – recomb()](https://sharp.pixelplumbing.com/api-colour/#recomb) · [linear()](https://sharp.pixelplumbing.com/api-operation/#linear) · [toColourspace()](https://sharp.pixelplumbing.com/api-colour/#tocolourspace)

**Description:**  
Converts the image to grayscale, allowing control over the relative weight of each RGB channel and secondary combinations (Y, C, M).  
You can adjust the influence of custom mixing (`strength`) and the final contrast (`contrast`).

**Parameters:**
- `r, y, g, c, b, m` — weights (0–200) for each channel.  
- `strength` — blending factor (0–100) between neutral (1/3,1/3,1/3) and custom weights.  
- `contrast` — contrast adjustment (-50 to +50).

**How it works:**
1. Computes normalized weights for R, G, and B.  
2. Interpolates between neutral and custom weights using `strength`.  
3. Manually recombines channels and applies contrast.

**Common uses:**  
- Lighten skin tones: increase `R` and `Y`.  
- Darken skies: reduce `B`.  
- Enhance foliage: increase `G`.

---

## `bc` — Brightness & Contrast
[Sharp Docs – modulate()](https://sharp.pixelplumbing.com/api-colour/#modulate) · [linear()](https://sharp.pixelplumbing.com/api-operation/#linear)

**Description:**  
Adjusts global brightness and contrast linearly.

**Parameters:**  
- `b` — brightness (-150 to +150%).  
- `c` — contrast (-150 to +150%).

**How it works:**  
- `modulate()` changes global brightness.  
- `linear()` applies contrast around midpoint (128).

**Common uses:**  
- Fix dark or washed-out images.  
- Quick correction after black & white conversion.

---

## `shadows` — Selective Shadow Lift
[Sharp Docs – gamma()](https://sharp.pixelplumbing.com/api-colour/#gamma) · [blur()](https://sharp.pixelplumbing.com/api-operation/#blur) · [composite()](https://sharp.pixelplumbing.com/api-composite/#composite)

**Description:**  
Brightens dark regions selectively without affecting highlights.

**Parameters:**  
- `intensity` — lightening strength (0–100).  
- `width` — tonal range affected (1–100).  
- `radius` — mask smoothing (1–200).

**How it works:**  
1. Creates an inverted mask based on shadow areas.  
2. Applies `gamma()` and `blur()` for smooth transitions.  
3. Uses `composite()` to overlay the brightened version.

**Common uses:**  
- Recover details in shadows without losing overall contrast.

---

## `highlights` — Highlight Recovery
[Sharp Docs – gamma()](https://sharp.pixelplumbing.com/api-colour/#gamma) · [blur()](https://sharp.pixelplumbing.com/api-operation/#blur) · [composite()](https://sharp.pixelplumbing.com/api-composite/#composite)

**Description:**  
Darkens overly bright regions to recover texture and detail.

**Parameters:**  
- `intensity` — recovery strength (0–100).  
- `width` — tonal range (1–100).  
- `radius` — smoothing radius (1–200).

**How it works:**  
1. Generates a mask targeting bright regions.  
2. Darkens the image proportionally to the mask.  
3. Composites the corrected layer onto the original.

**Common uses:**  
- Fix overexposed skies, reflections, or white surfaces with lost texture.

---

## `exposure` — EV / Offset / Gamma
[Sharp Docs – linear()](https://sharp.pixelplumbing.com/api-operation/#linear) · [gamma()](https://sharp.pixelplumbing.com/api-colour/#gamma)

**Description:**  
Simulates real photographic exposure adjustments — brightness (EV), offset, and midtone curve (`gamma`).

**Parameters:**  
- `ev` — exposure change (2^ev).  
- `offset` — direct offset (0–1).  
- `gamma` — tone curve (0.5–3).

**How it works:**  
1. `linear()` adjusts overall brightness and offset.  
2. `gamma()` shapes midtone contrast.  
3. Implements a fallback when `γ < 1` for stable brightening.

**Common uses:**  
- Adjust exposure before applying `shadows`, `highlights`, or `bc`.

---

## `levelsOut` — Output Tonal Range
[Sharp Docs – linear()](https://sharp.pixelplumbing.com/api-operation/#linear)

**Description:**  
Remaps the tonal output range by defining new black and white points.

**Parameters:**  
- `lo` — black point (0–255).  
- `hi` — white point (0–255).

**How it works:**  
Applies `linear(a, b)` where `a = (hi−lo)/255` and `b = lo`.

**Common uses:**  
- Reduce contrast for a “flat” look.  
- Prepare images for printing.

---

## `normalize` — Automatic Normalization
[Sharp Docs – normalize()](https://sharp.pixelplumbing.com/api-operation/#normalize)

**Description:**  
Automatically adjusts brightness and contrast by expanding the image histogram.

**Parameters:**  
- `black` — shadow clipping (%).  
- `white` — highlight clipping (%).

**How it works:**  
Executes `normalize({ lower, upper })` based on provided percentages.

**Common uses:**  
- Fix low-contrast or washed-out photos.

---

## `denoise` — Noise Reduction
[Sharp Docs – median()](https://sharp.pixelplumbing.com/api-operation/#median) · [blur()](https://sharp.pixelplumbing.com/api-operation/#blur)

**Description:**  
Reduces fine noise and grain using median and soft blur filters.

**Parameters:**  
- `level` — intensity (0–10).

**How it works:**  
- Applies `median(3)` for pixel smoothing.  
- Combines with progressive `blur()` based on intensity level.

**Common uses:**  
- Reduce ISO noise or JPEG compression artifacts.

---

## `sharpen` — Edge Sharpening
[Sharp Docs – sharpen()](https://sharp.pixelplumbing.com/api-operation/#sharpen)

**Description:**  
Enhances edge contrast, improving sharpness and texture clarity.

**Parameters:**  
- `amount` — strength (0–5).

**How it works:**  
Applies `sharpen(sigma, m1, m2)` with `sigma ≈ 0.8 + amount`.

**Common uses:**  
- Restore definition after noise reduction.

---

## `aiEnhance` — Resolution Upscale (2×)
[Sharp Docs – resize()](https://sharp.pixelplumbing.com/api-resize/#resize)

**Description:**  
Doubles image resolution using `lanczos3` interpolation, respecting maximum limits of 6000 px and 16 megapixels.

**Parameters:**  
- `enabled` — enables or disables the upscale.  
- `meta0.width/height` — base dimensions.

**How it works:**  
Duplicates the image while preserving aspect ratio and sharpness.

**Common uses:**  
- Enlarge small images before printing or detailed editing.
