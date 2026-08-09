const STORAGE_KEY = "whist-game-v1";
const HISTORY_KEY = "whist-history-v1";

const state = {
  gameId: null,
  startedAt: null,
  players: [],
  rounds: []
};

let gameHistory = [];

const elements = {
  setupScreen: document.querySelector("#setupScreen"),
  gameScreen: document.querySelector("#gameScreen"),
  setupForm: document.querySelector("#setupForm"),
  playerInputs: document.querySelector("#playerInputs"),
  addPlayerButton: document.querySelector("#addPlayerButton"),
  setupError: document.querySelector("#setupError"),
  resetButton: document.querySelector("#resetButton"),
  roundForm: document.querySelector("#roundForm"),
  roundInputs: document.querySelector("#roundInputs"),
  roundError: document.querySelector("#roundError"),
  bidHint: document.querySelector("#bidHint"),
  roundTitle: document.querySelector("#roundTitle"),
  roundSchedule: document.querySelector("#roundSchedule"),
  firstBidder: document.querySelector("#firstBidder"),
  cardsCount: document.querySelector("#cardsCount"),
  tricksProgress: document.querySelector("#tricksProgress"),
  leaderboard: document.querySelector("#leaderboard"),
  scoreHead: document.querySelector("#scoreHead"),
  scoreBody: document.querySelector("#scoreBody"),
  emptyHistory: document.querySelector("#emptyHistory"),
  undoButton: document.querySelector("#undoButton"),
  resetDialog: document.querySelector("#resetDialog"),
  confirmReset: document.querySelector("#confirmReset"),
  statisticsSummary: document.querySelector("#statisticsSummary"),
  playerStatistics: document.querySelector("#playerStatistics"),
  playerStatisticsBody: document.querySelector("#playerStatisticsBody"),
  completedGames: document.querySelector("#completedGames"),
  emptyStatistics: document.querySelector("#emptyStatistics"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  finishDialog: document.querySelector("#finishDialog"),
  finishTitle: document.querySelector("#finishTitle"),
  finishSubtitle: document.querySelector("#finishSubtitle"),
  finalRanking: document.querySelector("#finalRanking"),
  finishNewGame: document.querySelector("#finishNewGame"),
  finishStatistics: document.querySelector("#finishStatistics"),
  finishClose: document.querySelector("#finishClose")
};

function addPlayerInput(value = "") {
  const count = elements.playerInputs.children.length;
  if (count >= 6) return;

  const row = document.createElement("div");
  row.className = "player-row";
  row.innerHTML = `
    <input type="text" maxlength="18" placeholder="Numele jucătorului ${count + 1}" aria-label="Numele jucătorului ${count + 1}" value="${escapeHtml(value)}">
    <button class="remove-player" type="button" aria-label="Șterge jucătorul">×</button>
  `;
  row.querySelector("button").addEventListener("click", () => {
    if (elements.playerInputs.children.length <= 4) {
      showError(elements.setupError, "Sunt necesari cel puțin 4 jucători.");
      return;
    }
    row.remove();
    refreshPlayerPlaceholders();
    elements.addPlayerButton.disabled = false;
  });
  elements.playerInputs.append(row);
  elements.addPlayerButton.disabled = elements.playerInputs.children.length >= 6;
}

function refreshPlayerPlaceholders() {
  [...elements.playerInputs.querySelectorAll("input")].forEach((input, index) => {
    input.placeholder = `Numele jucătorului ${index + 1}`;
    input.setAttribute("aria-label", input.placeholder);
  });
}

function startGame(names) {
  state.gameId = crypto.randomUUID?.() || String(Date.now());
  state.startedAt = new Date().toISOString();
  state.players = names.map((name, index) => ({ id: crypto.randomUUID?.() || `${Date.now()}-${index}`, name }));
  state.rounds = [];
  saveState();
  renderGame();
}

function buildSchedule(playerCount) {
  return [
    ...Array(playerCount).fill(1),
    2, 3, 4, 5, 6, 7,
    ...Array(playerCount).fill(8),
    7, 6, 5, 4, 3, 2,
    ...Array(playerCount).fill(1)
  ];
}

function gameLabel(roundIndex, playerCount) {
  const schedule = buildSchedule(playerCount);
  const cards = schedule[roundIndex];
  if (cards !== 1 && cards !== 8) return `Joc de ${cards}`;

  const previousSameGames = schedule
    .slice(0, roundIndex + 1)
    .filter((value) => value === cards).length;
  const occurrence = cards === 1 && roundIndex >= schedule.length - playerCount
    ? previousSameGames - playerCount
    : previousSameGames;
  return `Joc de ${cards} · ${occurrence}/${playerCount}`;
}

function bidOptions(cards, forbiddenValue = null) {
  const options = ['<option value="">—</option>'];
  for (let value = 0; value <= cards; value += 1) {
    if (value !== forbiddenValue) options.push(`<option value="${value}">${value}</option>`);
  }
  return options.join("");
}

function valueOptions(values) {
  return [
    '<option value="">—</option>',
    ...values.map((value) => `<option value="${value}">${value}</option>`)
  ].join("");
}

function playersInBiddingOrder(roundIndex) {
  const firstIndex = roundIndex % state.players.length;
  return [...state.players.slice(firstIndex), ...state.players.slice(0, firstIndex)];
}

function calculateBaseScore(bid, tricks) {
  return bid === tricks ? 5 + bid : -Math.abs(bid - tricks);
}

function currentOutcomeStreak(playerId, wasSuccessful) {
  let streak = 0;
  for (let index = state.rounds.length - 1; index >= 0; index -= 1) {
    const round = state.rounds[index];
    if (round.cards === 1) break;
    const result = round.results.find((item) => item.playerId === playerId);
    if (!result || (result.bid === result.tricks) !== wasSuccessful) break;
    if ((wasSuccessful && result.bonus === 10) || (!wasSuccessful && result.penalty === -10)) break;
    streak += 1;
  }
  return streak;
}

function streakIndicators(playerId, cards) {
  if (cards === 1) return "";
  const target = state.players.length + 1;
  const wins = currentOutcomeStreak(playerId, true);
  if (wins > 0) return `<span class="streak streak-win">Premiere ${wins}/${target}</span>`;

  const losses = currentOutcomeStreak(playerId, false);
  if (losses > 0) return `<span class="streak streak-loss">Penalizare ${losses}/${target}</span>`;

  return "";
}

function totals() {
  return state.players.map((player) => ({
    ...player,
    score: state.rounds.reduce((sum, round) => {
      const result = round.results.find((item) => item.playerId === player.id);
      return sum + (result?.score || 0);
    }, 0)
  }));
}

function archiveCompletedGame() {
  const schedule = buildSchedule(state.players.length);
  if (state.rounds.length !== schedule.length) return;

  const finalTotals = totals().map(({ id, name, score }) => ({ id, name, score }));
  const bestScore = Math.max(...finalTotals.map((player) => player.score));
  const archivedGame = {
    id: state.gameId,
    startedAt: state.startedAt,
    completedAt: new Date().toISOString(),
    rounds: state.rounds.length,
    players: finalTotals.map((player) => ({ ...player, winner: player.score === bestScore }))
  };
  const existingIndex = gameHistory.findIndex((game) => game.id === state.gameId);
  if (existingIndex >= 0) return;
  gameHistory.unshift(archivedGame);
  saveHistory();
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(gameHistory));
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY));
    gameHistory = Array.isArray(saved) ? saved : [];
  } catch {
    gameHistory = [];
    localStorage.removeItem(HISTORY_KEY);
  }
}

function renderStatistics() {
  const hasHistory = gameHistory.length > 0;
  elements.emptyStatistics.classList.toggle("hidden", hasHistory);
  elements.playerStatistics.classList.toggle("hidden", !hasHistory);
  elements.clearHistoryButton.classList.toggle("hidden", !hasHistory);
  if (!hasHistory) {
    elements.statisticsSummary.innerHTML = "";
    elements.completedGames.innerHTML = "";
    return;
  }

  const playerMap = new Map();
  gameHistory.forEach((game) => game.players.forEach((player) => {
    const key = player.name.trim().toLocaleLowerCase("ro");
    const stats = playerMap.get(key) || { name: player.name, games: 0, wins: 0, total: 0 };
    stats.games += 1;
    stats.wins += player.winner ? 1 : 0;
    stats.total += player.score;
    playerMap.set(key, stats);
  }));
  const playerStats = [...playerMap.values()].sort((a, b) => b.wins - a.wins || b.total - a.total);
  const topPlayer = playerStats[0];
  const roundsPlayed = gameHistory.reduce((sum, game) => sum + game.rounds, 0);

  elements.statisticsSummary.innerHTML = `
    <article class="summary-card"><span>Partide terminate</span><strong>${gameHistory.length}</strong></article>
    <article class="summary-card"><span>Runde înregistrate</span><strong>${roundsPlayed}</strong></article>
    <article class="summary-card"><span>Cele mai multe victorii</span><strong>${escapeHtml(topPlayer.name)} · ${topPlayer.wins}</strong></article>
  `;
  elements.playerStatisticsBody.innerHTML = playerStats.map((player) => `
    <tr>
      <td>${escapeHtml(player.name)}</td><td>${player.games}</td><td>${player.wins}</td>
      <td class="${player.total >= 0 ? "score-positive" : "score-negative"}">${formatScore(player.total)}</td>
      <td>${(player.total / player.games).toFixed(1)}</td>
    </tr>
  `).join("");
  elements.completedGames.innerHTML = gameHistory.map((game) => {
    const winners = game.players.filter((player) => player.winner).map((player) => player.name).join(", ");
    const scores = [...game.players].sort((a, b) => b.score - a.score)
      .map((player) => `${escapeHtml(player.name)} ${formatScore(player.score)}`).join(" · ");
    return `
      <article class="completed-game">
        <div><strong>${formatDate(game.completedAt)}</strong><p>${game.players.length} jucători · ${game.rounds} runde</p></div>
        <div class="completed-game-result"><strong>🏆 ${escapeHtml(winners)}</strong><br>${scores}</div>
      </article>
    `;
  }).join("");
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
}

function showFinalScreen() {
  const ranked = totals().sort((a, b) => b.score - a.score);
  const bestScore = ranked[0].score;
  const winners = ranked.filter((player) => player.score === bestScore);
  elements.finishTitle.textContent = winners.length === 1
    ? `${winners[0].name} câștigă!`
    : "Avem egalitate!";
  elements.finishSubtitle.textContent = winners.length === 1
    ? `Felicitări pentru victoria cu ${bestScore} puncte.`
    : `${winners.map((player) => player.name).join(" și ")} împart primul loc.`;
  elements.finalRanking.innerHTML = ranked.map((player, index) => `
    <div class="final-player">
      <span class="final-rank">${index + 1}</span>
      <strong>${escapeHtml(player.name)}</strong>
      <span class="final-score">${formatScore(player.score)}</span>
    </div>
  `).join("");
  elements.finishDialog.showModal();
}

function renderGame() {
  const hasGame = state.players.length >= 4;
  elements.setupScreen.classList.toggle("hidden", hasGame);
  elements.gameScreen.classList.toggle("hidden", !hasGame);
  elements.resetButton.classList.toggle("hidden", !hasGame);
  if (!hasGame) return;

  const schedule = buildSchedule(state.players.length);
  const isFinished = state.rounds.length >= schedule.length;
  const roundNumber = Math.min(state.rounds.length + 1, schedule.length);
  const cards = schedule[state.rounds.length] ?? 1;
  const roundPlayers = playersInBiddingOrder(state.rounds.length);
  elements.roundTitle.textContent = isFinished ? "Partidă încheiată" : gameLabel(state.rounds.length, state.players.length);
  elements.roundSchedule.textContent = isFinished
    ? `Partidă încheiată · ${schedule.length} runde jucate`
    : `Runda ${roundNumber} din ${schedule.length}`;
  elements.cardsCount.textContent = cards;
  elements.firstBidder.textContent = isFinished ? "" : `Licitează primul: ${roundPlayers[0].name}`;
  elements.firstBidder.classList.toggle("hidden", isFinished);
  elements.tricksProgress.textContent = `Levate: 0 / ${cards}`;
  elements.roundError.textContent = "";

  elements.roundInputs.innerHTML = roundPlayers.map((player, orderIndex) => `
    <div class="round-grid round-player" data-player-id="${escapeHtml(player.id)}">
      <div class="player-info">
        <strong title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</strong>
        <div class="streaks">${streakIndicators(player.id, cards)}</div>
      </div>
      <select class="bid-input" aria-label="Licitația lui ${escapeHtml(player.name)}">
        ${bidOptions(cards)}
      </select>
      <select class="tricks-input" aria-label="Levate obținute de ${escapeHtml(player.name)}">
        ${bidOptions(cards)}
      </select>
    </div>
  `).join("");

  elements.roundInputs.querySelectorAll(".tricks-input").forEach((select) => select.addEventListener("change", () => {
    updateTrickOptions();
    updateTricksProgress();
  }));
  elements.roundInputs.querySelectorAll(".bid-input").forEach((select) => select.addEventListener("change", updateLastBidOptions));
  updateLastBidOptions();
  updateTrickOptions();
  elements.roundForm.querySelector(".save-round").disabled = isFinished;
  elements.roundForm.querySelector(".save-round").textContent = isFinished ? "Partidă încheiată" : "Salvează runda";
  elements.roundInputs.classList.toggle("hidden", isFinished);
  elements.roundForm.querySelector(".round-grid-header").classList.toggle("hidden", isFinished);
  elements.tricksProgress.classList.toggle("hidden", isFinished);
  renderScores();
}

function updateTrickOptions() {
  const trickInputs = [...document.querySelectorAll(".tricks-input")];
  if (!trickInputs.length) return;

  const cards = buildSchedule(state.players.length)[state.rounds.length] ?? 1;
  let values = trickInputs.map((select) => select.value === "" ? null : Number(select.value));
  let total = values.reduce((sum, value) => sum + (value ?? 0), 0);

  if (total === cards) {
    trickInputs.forEach((select, index) => {
      if (values[index] === null) {
        select.value = "0";
        values[index] = 0;
      }
    });
    total = cards;
  }

  const remaining = Math.max(0, cards - total);
  trickInputs.forEach((select, index) => {
    const currentValue = values[index];
    const maximum = Math.min(cards, (currentValue ?? 0) + remaining);
    const allowedValues = Array.from({ length: maximum + 1 }, (_, value) => value);

    select.disabled = false;
    select.innerHTML = valueOptions(allowedValues);
    if (currentValue !== null) select.value = String(currentValue);
  });
}

function updateLastBidOptions() {
  const bidInputs = [...document.querySelectorAll(".bid-input")];
  if (!bidInputs.length) return;

  const cards = buildSchedule(state.players.length)[state.rounds.length] ?? 1;
  const earlierBids = bidInputs.slice(0, -1);
  const lastBid = bidInputs.at(-1);
  const allEarlierSelected = earlierBids.every((select) => select.value !== "");
  const previousValue = lastBid.value;
  const earlierTotal = earlierBids.reduce((sum, select) => sum + Number(select.value || 0), 0);
  const forbiddenValue = cards - earlierTotal;

  lastBid.disabled = !allEarlierSelected;
  lastBid.innerHTML = bidOptions(cards, forbiddenValue >= 0 && forbiddenValue <= cards ? forbiddenValue : null);
  if ([...lastBid.options].some((option) => option.value === previousValue)) lastBid.value = previousValue;

  elements.bidHint.textContent = allEarlierSelected
    ? `Ultimul jucător nu poate licita ${forbiddenValue >= 0 && forbiddenValue <= cards ? forbiddenValue : "o valoare care egalează totalul"}.`
    : "Completează licitațiile în ordine; ultimul jucător va fi deblocat la final.";
}

function updateTricksProgress() {
  const schedule = buildSchedule(state.players.length);
  const cards = schedule[state.rounds.length] ?? 1;
  const sum = [...document.querySelectorAll(".tricks-input")].reduce((total, input) => total + (Number(input.value) || 0), 0);
  elements.tricksProgress.textContent = `Levate: ${sum} / ${cards}`;
  elements.tricksProgress.style.color = sum === cards ? "var(--green-light)" : sum > cards ? "var(--red)" : "";
}

function renderScores() {
  const ranked = totals().sort((a, b) => b.score - a.score);
  elements.leaderboard.innerHTML = ranked.map((player, index) => `
    <article class="leader">
      <span class="leader-rank">LOCUL ${index + 1}</span>
      <strong class="leader-name">${escapeHtml(player.name)}</strong>
      <span class="leader-score">${formatScore(player.score)}</span>
    </article>
  `).join("");

  elements.scoreHead.innerHTML = `<tr><th>Runda</th>${state.players.map((p) => `<th>${escapeHtml(p.name)}</th>`).join("")}</tr>`;
  elements.scoreBody.innerHTML = state.rounds.map((round, index) => `
    <tr>
      <td>${index + 1} · ${round.cards}c</td>
      ${state.players.map((player) => {
        const result = round.results.find((item) => item.playerId === player.id);
        const className = result.score >= 0 ? "score-positive" : "score-negative";
        const bonus = result.bonus ? `<span class="bonus">+${result.bonus} PREMIU</span>` : "";
        const penalty = result.penalty ? `<span class="streak-penalty">${result.penalty} PENALIZARE</span>` : "";
        return `<td class="${className}" title="Licitat ${result.bid}, obținut ${result.tricks}">${formatScore(result.score)}${bonus}${penalty}</td>`;
      }).join("")}
    </tr>
  `).join("");

  const hasRounds = state.rounds.length > 0;
  elements.emptyHistory.classList.toggle("hidden", hasRounds);
  elements.undoButton.classList.toggle("hidden", !hasRounds);
}

function saveRound(event) {
  event.preventDefault();
  const schedule = buildSchedule(state.players.length);
  if (state.rounds.length >= schedule.length) return;
  const cards = schedule[state.rounds.length];
  const playerRows = [...elements.roundInputs.querySelectorAll(".round-player")];
  const bidInputs = playerRows.map((row) => row.querySelector(".bid-input"));
  const bids = bidInputs.map((input) => Number(input.value));
  const trickInputs = playerRows.map((row) => row.querySelector(".tricks-input"));
  const tricks = trickInputs.map((input) => Number(input.value));

  if (bidInputs.some((input) => input.value === "")) {
    showError(elements.roundError, "Completează licitația fiecărui jucător.");
    return;
  }
  if (trickInputs.some((input) => input.value === "")) {
    showError(elements.roundError, "Selectează levatele obținute de fiecare jucător.");
    return;
  }
  if ([...bids, ...tricks].some((value) => !Number.isInteger(value) || value < 0 || value > cards)) {
    showError(elements.roundError, `Valorile trebuie să fie numere întregi între 0 și ${cards}.`);
    return;
  }
  if (tricks.reduce((sum, value) => sum + value, 0) !== cards) {
    showError(elements.roundError, `Totalul levatelor obținute trebuie să fie exact ${cards}.`);
    return;
  }
  if (bids.reduce((sum, value) => sum + value, 0) === cards) {
    showError(elements.roundError, `Suma licitațiilor nu poate fi egală cu ${cards}.`);
    return;
  }

  const bonusTarget = state.players.length + 1;
  state.rounds.push({
    cards,
    results: playerRows.map((row, index) => {
      const playerId = row.dataset.playerId;
      const successful = bids[index] === tricks[index];
      const earnsBonus = cards > 1 && successful &&
        currentOutcomeStreak(playerId, true) + 1 === bonusTarget;
      const earnsPenalty = cards > 1 && !successful &&
        currentOutcomeStreak(playerId, false) + 1 === bonusTarget;
      const bonus = earnsBonus ? 10 : 0;
      const penalty = earnsPenalty ? -10 : 0;

      return {
        playerId,
        bid: bids[index],
        tricks: tricks[index],
        bonus,
        penalty,
        score: calculateBaseScore(bids[index], tricks[index]) + bonus + penalty
      };
    })
  });
  archiveCompletedGame();
  saveState();
  renderGame();
  renderStatistics();
  if (state.rounds.length === schedule.length) showFinalScreen();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.players?.length >= 4 && Array.isArray(saved.rounds)) {
      state.gameId = saved.gameId || crypto.randomUUID?.() || String(Date.now());
      state.startedAt = saved.startedAt || new Date().toISOString();
      state.players = saved.players;
      state.rounds = saved.rounds;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function showError(element, message) {
  element.textContent = message;
}

function formatScore(score) {
  return score > 0 ? `+${score}` : String(score);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

elements.addPlayerButton.addEventListener("click", () => addPlayerInput());
elements.setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const names = [...elements.playerInputs.querySelectorAll("input")].map((input) => input.value.trim());
  if (names.some((name) => !name)) {
    showError(elements.setupError, "Completează numele tuturor jucătorilor.");
    return;
  }
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
    showError(elements.setupError, "Fiecare jucător trebuie să aibă un nume diferit.");
    return;
  }
  startGame(names);
});
elements.roundForm.addEventListener("submit", saveRound);
elements.undoButton.addEventListener("click", () => {
  state.rounds.pop();
  const archivedIndex = gameHistory.findIndex((game) => game.id === state.gameId);
  if (archivedIndex >= 0) {
    gameHistory.splice(archivedIndex, 1);
    saveHistory();
  }
  saveState();
  renderGame();
  renderStatistics();
});
elements.resetButton.addEventListener("click", () => elements.resetDialog.showModal());
elements.confirmReset.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  state.players = [];
  state.rounds = [];
  state.gameId = null;
  state.startedAt = null;
  elements.playerInputs.innerHTML = "";
  ["", "", "", ""].forEach(addPlayerInput);
  renderGame();
});

elements.finishClose.addEventListener("click", () => elements.finishDialog.close());
elements.finishStatistics.addEventListener("click", () => {
  elements.finishDialog.close();
  document.querySelector("#statisticsSection").scrollIntoView({ behavior: "smooth" });
});
elements.finishNewGame.addEventListener("click", () => {
  elements.finishDialog.close();
  localStorage.removeItem(STORAGE_KEY);
  state.players = [];
  state.rounds = [];
  state.gameId = null;
  state.startedAt = null;
  elements.playerInputs.innerHTML = "";
  ["", "", "", ""].forEach(addPlayerInput);
  renderGame();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

elements.clearHistoryButton.addEventListener("click", () => {
  if (!window.confirm("Ștergi toate statisticile și partidele finalizate de pe acest dispozitiv?")) return;
  gameHistory = [];
  localStorage.removeItem(HISTORY_KEY);
  renderStatistics();
});

loadHistory();
loadState();
archiveCompletedGame();
if (!state.players.length) ["", "", "", ""].forEach(addPlayerInput);
renderGame();
renderStatistics();
