// Rounds and money: the match is first to 5, at most 9 rounds. Every round opens
// with a 15-second buy phase, then 100 seconds of fighting, then a short breather
// that names the winner before the next buy phase. Money pays for the next round's
// guns: a kill is +$300, a round win +$1,000, a loss +$500, a defuse +$300.
// The module owns the clock and the wallet; main.js owns the world it pays for.
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const ROUND_END_SECONDS = 4;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

const KILL_PAY = 300;
const WIN_PAY = 1000;
const LOSS_PAY = 500;
const DEFUSE_PAY = 300;

export function createRounds() {
  const state = {
    phase: 'menu',
    phaseAt: 0,
    round: 0,
    wins: 0,
    losses: 0,
    money: 800,
    kills: 0,
    frags: 0,
    armor: false,
    kit: false,
    site: null,
    lastReason: '',
    matchWon: false,
  };

  return {
    state,
    startMatch(time) {
      state.round = 0;
      state.wins = 0;
      state.losses = 0;
      state.money = 800;
      state.kills = 0;
      state.frags = 0;
      state.armor = false;
      state.kit = false;
      state.matchWon = false;
      this.nextRound(time);
    },
    nextRound(time) {
      state.round += 1;
      state.phase = 'buy';
      state.phaseAt = time;
      state.site = Math.random() < 0.5 ? 'A' : 'B';
      state.frags = 0;
      state.armor = false;
      state.kit = false;
    },
    startFight(time) {
      state.phase = 'fight';
      state.phaseAt = time;
    },
    // Seconds left in the current phase (buy or fight), or null outside them.
    phaseLeft(time) {
      if (state.phase === 'buy') return Math.max(0, BUY_SECONDS - (time - state.phaseAt));
      if (state.phase === 'fight') return Math.max(0, ROUND_SECONDS - (time - state.phaseAt));
      return null;
    },
    addKill() {
      state.kills += 1;
      state.money += KILL_PAY;
    },
    addDefusePay() {
      state.money += DEFUSE_PAY;
    },
    // Ends the round and pays out. Returns 'match' when the match is over.
    endRound(won, reason, time) {
      state.lastReason = reason;
      state.lastWon = won;
      if (won) {
        state.wins += 1;
        state.money += WIN_PAY;
      } else {
        state.losses += 1;
        state.money += LOSS_PAY;
      }
      state.phase = 'roundEnd';
      state.phaseAt = time;
      const over = state.wins >= WIN_ROUNDS || state.losses >= WIN_ROUNDS || state.round >= MAX_ROUNDS;
      if (over) {
        state.matchWon = state.wins > state.losses;
        state.phase = 'matchEnd';
      }
      return over ? 'match' : 'round';
    },
    // Spend money on a buy-menu item. Returns true when the purchase lands.
    spend(amount) {
      if (amount <= 0 || state.money < amount) return false;
      state.money -= amount;
      return true;
    },
    buyFrag() {
      if (state.frags >= 2) return false;
      state.frags += 1;
      return true;
    },
    buyArmor() {
      if (state.armor) return false;
      state.armor = true;
      return true;
    },
    buyKit() {
      if (state.kit) return false;
      state.kit = true;
      return true;
    },
    scoreText() {
      return `${state.wins} — ${state.losses}`;
    },
  };
}
