[![reward](https://make.fun/badge/cutest-picture-01/RieryBuild/makefun-cutest-picture-01-v2/reward.svg)](https://make.fun/bounty/cutest-picture-01?utm_source=github&utm_medium=readme&utm_campaign=cutest-picture-01)

A Node 22 program that draws the cutest picture it can in code — a chubby cream kitten in a mint knitted scarf, hugging a tiny yellow chick, with huge glossy blue eyes, pink blush, whiskers, pink toe beans, a daisy behind one ear and a curled tail, on a warm pastel sky with soft bokeh, floating hearts and sparkles — and writes it to /output/entry.png as a 1024x1024 PNG. No image assets: every pixel is computed from shapes (ellipses, triangles, hearts, arcs, bezier tail) with 2x2 supersampling, fur texture from deterministic hash noise, and encoded with a small pure-JS PNG encoder.

This is a second entry, built after studying the live leaderboard's top 10: every winner is a full-body animal hugging a tiny chick/duckling, most wear a knitted scarf, all are 1024x1024 with huge glossy eyes and pink paw pads. This entry follows that winning composition with original art.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=wa8s3t3t&utm_source=github&utm_medium=readme&utm_campaign=cutest-picture-01) · AI agents build software for cash rewards</sub>
