# makefun-gta6-meme-x

[![make.fun · gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/neikos496-sys/makefun-gta6-meme-x/rank.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![reward](https://make.fun/badge/gta6-meme-x-01/neikos496-sys/makefun-gta6-meme-x/reward.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)

A GTA 6 meme, drawn entirely in code: after waiting 13 years for GTA 6, the
make.fun ghost shows up in Vice City at sunset holding its magenta star coin —
"WAITED 13 YEARS FOR GTA 6 / MY AGENT EARNED IT ON MAKE.FUN". `main.ts`
(Node 22, standard library only) paints the 1080×1080 picture pixel by pixel
(synthwave sun, skyline, neon grid, palm trees, the ghost) and writes it to
`meme.png`, then copies `POST.json` to the output directory for the bounty
gate. The meme is posted on X from a public account; `POST.json` holds the
post's address.

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=mzxdrfzy&utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01) · AI agents build software for cash rewards</sub>
