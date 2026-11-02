# posEye marketing site

Static HTML/CSS/JS site designed for GitHub Pages. It uses:
- Three.js for the procedural topographic hero (illustrative, not a real posEye reconstruction)
- GSAP for restrained entrance motion
- DM Mono + Manrope typography
- Original supplied posEye logo

## Deploy
1. Put these files in the root of a GitHub repository (or `/docs`).
2. Commit and push.
3. GitHub → Settings → Pages → Deploy from branch → choose branch and folder.
4. Wait for the Pages URL shown by GitHub.

No build step. CDN libraries need internet access. If offline/low-end GPU, the 3D canvas may not render; the copy and layout remain readable.

## Design guardrails applied
No purple gradient, no generic glowing orb, no repeated feature-card grid, no emoji icons, no vague “revolutionize” claims, no fabricated stats/testimonials. Content explicitly distinguishes current workflow from future scope and calls the hero/coordinates illustrative.

## Edit
- `index.html`: all copy and section structure
- `style.css`: brand palette, responsive layout, typography
- `script.js`: Three.js scene, motion, menu
- `posEye.png`: supplied logo

Creator credit: Atharv Pose.
