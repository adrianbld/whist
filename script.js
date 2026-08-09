const STORAGE_KEY = "whist-game-v1";

const state = {
  players: [],
  rounds: []
};

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
  confirmReset: document.querySelector("#confirmReset")
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

function totals() {
  return state.players.map((player) => ({
    ...player,
    score: state.rounds.reduce((sum, round) => {
      const result = round.results.find((item) => item.playerId === player.id);
      return sum + (result?.score || 0);
    }, 0)
  }));
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
      <strong title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</strong>
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
  let remaining = cards;
  let previousCompleted = true;

  trickInputs.forEach((select, index) => {
    const previousValue = select.value;
    const isLast = index === trickInputs.length - 1;
    const allowedValues = isLast
      ? [remaining]
      : Array.from({ length: remaining + 1 }, (_, value) => value);

    select.disabled = !previousCompleted;
    select.innerHTML = valueOptions(allowedValues);

    if (previousCompleted && allowedValues.includes(Number(previousValue)) && previousValue !== "") {
      select.value = previousValue;
      remaining -= Number(previousValue);
    } else {
      select.value = "";
      previousCompleted = false;
    }
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
  saveState();
  renderGame();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.players?.length >= 4 && Array.isArray(saved.rounds)) {
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
  saveState();
  renderGame();
});
elements.resetButton.addEventListener("click", () => elements.resetDialog.showModal());
elements.confirmReset.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  state.players = [];
  state.rounds = [];
  elements.playerInputs.innerHTML = "";
  ["", "", "", ""].forEach(addPlayerInput);
  renderGame();
});

loadState();
  if (!state.players.length) ["", "", "", ""].forEach(addPlayerInput);
renderGame();
