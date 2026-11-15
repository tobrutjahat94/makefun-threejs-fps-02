// The DOM HUD: crosshair, hit marker, health, ammunition, the round timer and the
// score, the money, the kill feed, the spike banner and the buy menu. It never
// touches the simulation; main.js pushes numbers in and reads the button callbacks
// out. Every update is cached, so a steady value costs no DOM write at all.
const OVERLAY_COPY = {
  start: {
    title: 'SABLE YARD',
    copy: 'One defender. Five attackers. Hold the yard — stop the spike before it blows, or drop all five before they plant.',
    action: 'Deploy',
  },
  paused: {
    title: 'SABLE YARD',
    copy: 'Paused. Click to get back in the yard.',
    action: 'Resume',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayCopy = $('overlay-copy');
  const overlayAction = $('overlay-action');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const armorBadge = $('armor-badge');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const roundValue = $('round-value');
  const moneyValue = $('money-value');
  const killsValue = $('kills-value');
  const killfeed = $('killfeed');
  const bombBanner = $('bomb-banner');
  const intelLine = $('intel-line');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyPanel = $('buy');
  const buyMoney = $('buy-money');
  const vignette = $('vignette');
  const defuseBar = $('defuse-bar');
  const defuseFill = $('defuse-fill');

  let lastHealth = -1;
  let lastArmor = null;
  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastTimer = '';
  let lastScore = '';
  let lastRound = '';
  let lastMoney = -1;
  let lastKills = -1;
  let lastBomb = '';
  let lastIntel = '';
  let hitTimer = 0;
  let bannerTimer = 0;
  let buyShownAt = 0;

  return {
    setHealth(hp, armor) {
      const value = Math.max(0, Math.round(hp));
      if (value !== lastHealth) {
        lastHealth = value;
        healthValue.textContent = String(value);
        healthFill.style.width = `${value}%`;
        healthFill.classList.toggle('low', value <= 30);
      }
      if (armor !== lastArmor) {
        lastArmor = armor;
        armorBadge.hidden = !armor;
      }
    },
    setAmmo(mag, reserve, weapon) {
      if (mag !== lastMag || reserve !== lastReserve) {
        lastMag = mag;
        lastReserve = reserve;
        ammoMag.textContent = String(mag);
        ammoReserve.textContent = `/ ${reserve}`;
        $('ammo').classList.toggle('empty', mag === 0);
      }
      if (weapon !== lastWeapon) {
        lastWeapon = weapon;
        weaponName.textContent = weapon;
      }
    },
    setTimer(text) {
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
    },
    setScore(wins, losses, round) {
      const score = `${wins} — ${losses}`;
      if (score !== lastScore) {
        lastScore = score;
        scoreValue.textContent = score;
      }
      const label = `ROUND ${round}`;
      if (label !== lastRound) {
        lastRound = label;
        roundValue.textContent = label;
      }
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setKills(value) {
      if (value === lastKills) return;
      lastKills = value;
      killsValue.textContent = String(value);
    },
    setSpread(gapPx) {
      crosshair.style.setProperty('--gap', `${gapPx.toFixed(1)}px`);
    },
    hitMarker(killed) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), killed ? 260 : 110);
    },
    damageFlash() {
      vignette.classList.remove('flash');
      void vignette.offsetWidth;
      vignette.classList.add('flash');
    },
    killfeed(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.classList.add('fade'), 4200);
      setTimeout(() => line.remove(), 5000);
    },
    showBanner(title, sub = '', holdMs = 2600) {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, holdMs);
    },
    setBomb(text, urgent = false) {
      if (text === lastBomb) return;
      lastBomb = text;
      if (!text) {
        bombBanner.hidden = true;
        return;
      }
      bombBanner.hidden = false;
      bombBanner.textContent = text;
      bombBanner.classList.toggle('urgent', urgent);
    },
    setIntel(text) {
      if (text === lastIntel) return;
      lastIntel = text;
      intelLine.textContent = text;
      intelLine.hidden = !text;
    },
    setDefuse(progress) {
      if (progress <= 0) {
        defuseBar.hidden = true;
        return;
      }
      defuseBar.hidden = false;
      defuseFill.style.width = `${Math.round(progress * 100)}%`;
    },
    showOverlay(mode, data = {}) {
      let title;
      let copy;
      let action;
      if (mode === 'roundEnd') {
        title = data.won ? 'ROUND HELD' : 'ROUND LOST';
        copy = `${data.reason} — the yard stands ${data.score}.`;
        action = 'Next round';
      } else if (mode === 'matchEnd') {
        title = data.won ? 'YARD HELD' : 'YARD LOST';
        copy = data.won
          ? `The yard is yours, ${data.score}. Five attackers walked in; none walked out with the spike.`
          : `The spike took the yard, ${data.score}. Run it back.`;
        action = 'Run it back';
      } else {
        const text = OVERLAY_COPY[mode];
        title = text.title;
        copy = text.copy;
        action = text.action;
      }
      overlayTitle.textContent = title;
      overlayCopy.textContent = copy;
      overlayAction.textContent = action;
      overlay.hidden = false;
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    showBuy(items, money) {
      buyShownAt = performance.now();
      this.setMoney(money);
      for (const item of buyPanel.querySelectorAll('[data-item]')) {
        const id = item.dataset.item;
        const def = items[id];
        if (!def) continue;
        item.querySelector('.buy-price').textContent = def.price === 0 ? 'OWNED' : `$${def.price}`;
        item.classList.toggle('cant', money < def.price && def.price > 0);
        item.classList.toggle('owned', def.owned);
      }
      buyPanel.hidden = false;
    },
    hideBuy() {
      buyPanel.hidden = true;
    },
    buyVisible() {
      return !buyPanel.hidden;
    },
    onAction(handler) {
      overlayAction.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyPanel.addEventListener('click', (event) => {
        // The click that opened this menu (Deploy, or B) lands here too as its
        // mouse-up; swallow clicks from the first quarter-second.
        if (performance.now() - buyShownAt < 250) return;
        const button = event.target.closest('[data-item]');
        if (button) handler(button.dataset.item);
      });
    },
    onDeploy(handler) {
      $('buy-deploy').addEventListener('click', handler);
    },
  };
}
