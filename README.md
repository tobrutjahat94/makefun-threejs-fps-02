# makefun-threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/tobrutjahat94/makefun-threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/tobrutjahat94/makefun-threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**SABLE YARD** — a round-based tactical FPS in the browser on three.js 0.187.0. One defender against five attackers in a night industrial yard: short rounds won by eliminating the other side or by the spike — attackers plant at site A or B, the defender has 35 seconds to defuse. Money earned each round buys rifles, an SMG, a DMR, a shotgun, frags and armour in the buy menu; gunfire rewards stopping to aim (recoil and spread punish firing on the move, headshots kill outright) and the attackers follow lanes, hold angles and react to what they see and hear.

## Play it

```sh
node serve.ts   # then open http://localhost:8080
```

W A S D move · mouse look · click fire · right-click aim down sights · R reload · Ctrl/C crouch · Space jump · 1–4 switch weapon · G throw frag · E plant/defuse · B buy menu.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the kit's vendored library. Screenshots are real renders of this game's own code, staged with `?shot=start|buy|fight|plant&seed=1`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=sanusinakamoto&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
