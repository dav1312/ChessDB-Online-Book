const startpos = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  arrowSwitch = document.getElementById("arrowSwitch"),
  arrowSwitchState = localStorage.getItem("arrowSwitchState"),
  chessboardEl = document.getElementById("board"),
  inputFen = document.getElementById("inputFenBox"),
  inputPgn = document.getElementById("inputPgnBox"),
  screenshotBtn = document.getElementById("screenshotBtn"),
  setupFenBtn = document.getElementById("setupFenBtn"),
  setupPgnBtn = document.getElementById("setupPgnBtn"),
  startBtn = document.getElementById("startBtn"),
  undoBtn = document.getElementById("undoBtn"),
  flipBtn = document.getElementById("flipBtn"),
  requestBtn = document.getElementById("requestBtn"),
  refreshBtn = document.getElementById("refreshBtn"),
  topMovePv = document.getElementById("topMovePv"),
  topNodePvSwitch = document.getElementById("topNodePvSwitch"),
  topNodePvSwitchState = localStorage.getItem("topNodePvSwitchState"),
  statsPositionCount = document.getElementById("statsPositionCount"),
  statsScoring = document.getElementById("statsScoring"),
  statsSieving = document.getElementById("statsSieving"),
  bookProbeResults = document.getElementById("bookProbeResults"),
  movesListTable = document.getElementById("movesList"),
  advancePvs = document.getElementById("advance-pvs"),
  amountAdvancedPvs = 4,
  leafNodeEvalsSwitch = document.getElementById("leafNodeEvalsSwitch"),
  leafNodeEvalsSwitchState = localStorage.getItem("leafNodeEvalsSwitchState"),
  squareClass = "square-55d63",
  highlightSquare = "highlight-sq",
  legalMoveSquare = "legalMove-sq",
  takesSquare = "takes-sq",
  apiUrl = "https://www.chessdb.cn/",
  apiQueryAll = `${apiUrl}cdb.php?action=queryall&json=1&board=`,
  apiQueryPv = `${apiUrl}cdb.php?action=querypv&json=1&board=`,
  apiQueue = `${apiUrl}cdb.php?action=queue&board=`,
  apiStatsc = `${apiUrl}statsc.php?json=1`,
  arrowsColor = "rgb(0, 48, 136)",
  lichessExport = "https://lichess1.org/export/fen.gif";

document.getElementById("amountLeafNodeEvals").textContent = amountAdvancedPvs;

for (let i = 1; i <= amountAdvancedPvs; i++) {
  const advancedPvDiv = document.createElement("div");
  advancedPvDiv.id = `advance-pv${i}`;
  advancePvs.insertAdjacentElement("beforeend", advancedPvDiv);
}

let board,
  game = new Chess();

if (leafNodeEvalsSwitchState !== null) {
  leafNodeEvalsSwitchState == "true"
    ? leafNodeEvalsSwitch.checked = true
    : leafNodeEvalsSwitch.checked = false;
}

if (topNodePvSwitchState !== null) {
  topNodePvSwitchState == "true"
    ? topNodePvSwitch.checked = true
    : topNodePvSwitch.checked = false;
}

if (arrowSwitchState !== null) {
  arrowSwitchState == "true"
    ? arrowSwitch.checked = true
    : arrowSwitch.checked = false;
}

const removeCssClass = (cssClass) => {
  chessboardEl
    .querySelectorAll(`.${cssClass}`)
    .forEach((square) => square.classList.remove(cssClass));
};

const addCssClassToSquare = (square, cssClass) => {
  chessboardEl.querySelector(`.square-${square}`).classList.add(cssClass);
};

const addHighlights = (source, target) => {
  chessboardEl
    .querySelector(`.square-${source}`)
    .classList.add(highlightSquare);
  chessboardEl
    .querySelector(`.square-${target}`)
    .classList.add(highlightSquare);
};

const addHighlightsFromHistory = () => {
  moveHistory = game.history({ verbose: true });
  if (moveHistory.length >= 1) {
    lastMove = moveHistory[moveHistory.length - 1];
    addHighlights(lastMove.from, lastMove.to);
  }
};

// Disable picking of pieces if the game is over. Also disable picking
// of pieces for the side not to move.
const onDragStart = (source, piece) => {
  // Prevent scroll when the user tries to move a piece
  document.body.style.overflow = "hidden";

  const moves = game.moves({
    square: source,
    verbose: true,
  });

  // highlight the possible squares for this piece
  for (let i = 0; i < moves.length; i++) {
    const cssClass = moves[i].san.includes("x") ? takesSquare : legalMoveSquare;
    addCssClassToSquare(moves[i].to, cssClass);
  }

  if (
    game.game_over() === true ||
    (game.turn() === "w" && piece.search(/^b/) !== -1) ||
    (game.turn() === "b" && piece.search(/^w/) !== -1)
  ) {
    return false;
  }
};

const onDrop = (source, target) => {
  // Restore scroll
  document.body.style.overflow = "";

  // see if the move is legal
  const move = game.move({
    from: source,
    to: target,
    promotion: "q", // NOTE: always promote to a queen for example simplicity
  });

  removeCssClass(legalMoveSquare);
  removeCssClass(takesSquare);

  // illegal move
  if (move === null) return "snapback";

  // Highlight the last move made
  removeCssClass(highlightSquare);
  addHighlights(source, target);

  updateStatus();
};

// update the board position after the piece snap
// for castling, en passant, pawn promotion
const onSnapEnd = () => {
  board.position(game.fen());
};

const cfg = {
  draggable: true,
  position: "start",
  onDragStart: onDragStart,
  onDrop: onDrop,
  onSnapEnd: onSnapEnd,
  pieceTheme: "img/chesspieces/cburnett/{piece}.svg",
};

const doMove = (moves) => {
  movesArr = moves.split(',');
  movesArr.forEach(move => game.move(move));
  board.position(game.fen());
  // Remove highlight again in case the user used the move table
  removeCssClass(highlightSquare);
  addHighlightsFromHistory();
  updateStatus();
};

// ChessDB queries
const requestQueue = async () => {
  try {
    await fetch(`${apiQueue}${game.fen()}`);
    console.log("FEN requested");
    updateStatus();
  } catch (error) {
    console.error("requestQueue failed");
    console.error(error);
  }
};

const getStats = async () => {
  try {
    const data = await (await fetch(apiStatsc)).json();
    statsPositionCount.textContent = data.positions.toLocaleString();
    statsScoring.textContent = data.queue.scoring.toLocaleString();
    statsSieving.textContent = data.queue.sieving.toLocaleString();
  } catch (error) {
    console.error("getStats failed");
    console.error(error);
  }
};

const displayScore = (score) => {
  if (game.turn() === "b") score *= -1;
  if (score > 25000) return `+M${30000 - score}`;
  if (score < -25000) return `-M${30000 + score}`;
  if (score > 20000) return `White wins in ${25000 - score}`;
  if (score < -20000) return `Black wins in ${25000 + score}`;
  return score > 0 ? `+${(score / 100).toFixed(2)}` : (score / 100).toFixed(2);
};

const countPieces = (fen) => {
  let board = fen.toLowerCase().split(" ")[0].split("");
  let pieces = "qrbnkp";
  const count =
    board.length -
    board.filter((fenPiece) => !pieces.includes(fenPiece)).length;
  return count;
};

const chessDbEnoughPieces = (fen) => {
  const MIN_TOTAL = 7;
  return countPieces(fen) > MIN_TOTAL;
};

const coordinates = (uciMove) => {
  return [
    uciMove.charCodeAt(0) - 97,
    uciMove[1] - 1,
    uciMove.charCodeAt(2) - 97,
    uciMove[3] - 1,
  ];
};

const removeArrows = () => {
  const arrowContainer = document.getElementById("arrowContainer");
  if (arrowContainer != null) arrowContainer.remove();
};

const addArrowContainer = () => {
  const newArrowContainer = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );
  newArrowContainer.setAttribute("viewBox", "0 0 100 100");
  newArrowContainer.classList.add("arrow");
  if (board.orientation() === "black") newArrowContainer.classList.add("rotate180");
  newArrowContainer.id = "arrowContainer";
  const arrowHeight = 4,
    arrowWidth = 6,
    arrowMoveForward = 1.5;
  newArrowContainer.innerHTML = `
    <defs>
      <marker
        id="arrowHead"
        markerWidth="${arrowHeight}"
        markerHeight="${arrowWidth}"
        refX="${arrowMoveForward}"
        refY="${arrowWidth / 2}"
        orient="auto"
        fill="${arrowsColor}"
      >
        <polygon points="0 0, ${arrowHeight} ${arrowWidth / 2}, 0 ${arrowWidth}" />
      </marker>
    </defs>
  `;
  chessboardEl.appendChild(newArrowContainer);
  return newArrowContainer;
};

const updateScreenshotLink = () => {
  const moveHistory = game.history({ verbose: true });
  const lastMove =
    moveHistory.length >= 1
      ? moveHistory[moveHistory.length - 1].from +
        moveHistory[moveHistory.length - 1].to
      : "";
  screenshotBtn.href = `${lichessExport}?fen=${game.fen()}&color=${board.orientation() === "black" ? "black" : "white"}&lastMove=${lastMove}`;
};

const line = (x1, y1, x2, y2) => {
  const lineWidth = 2;
  let dx = x2 - x1;
  let dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length > 0) {
    dx /= length;
    dy /= length;
  }
  const x3 = x1 + dx * (length - 5);
  const y3 = y1 + dy * (length - 5);

  return `
    <line x1="${x1}" y1="${y1}" x2="${x3}" y2="${y3}"
    opacity="0.4" stroke="${arrowsColor}" stroke-width="${lineWidth}"
    marker-end="url(#arrowHead)" stroke-linecap="round" />
  `;
};

const drawArrow = (uciMove) => {
  const [moveStartX, moveStartY, moveEndX, moveEndY] = coordinates(uciMove);

  // Center arrows in squares
  const arrowStartX = moveStartX * (100 / 8) + (100 / 8 / 2);
  const arrowStartY = 100 - moveStartY * (100 / 8) - (100 / 8 / 2);
  const arrowEndX = moveEndX * (100 / 8) + (100 / 8 / 2);
  const arrowEndY = 100 - moveEndY * (100 / 8) - (100 / 8 / 2);

  const lineString = line(arrowStartX, arrowStartY, arrowEndX, arrowEndY);

  let arrowContainer = document.getElementById("arrowContainer");
  if (arrowContainer == null) arrowContainer = addArrowContainer();

  arrowContainer.insertAdjacentHTML("beforeend", lineString);
};

// Query leaf score of top X move.
// Get the top move, push it, and query its PV. Walk the PV except the
// last move and query its PV again to get its leaf node score.
const queryLeaf = (data, numPv) => {
  const idStr = `advance-pv${numPv}`;
  const label = `Pv ${numPv}: `;
  document.getElementById(idStr).textContent = label;
  if (typeof data.moves === "undefined") {
    console.log("Query all, there is no book move!");
  } else {
    const json = data.moves;
    for (let j = numPv - 1; j < Math.min(numPv, json.length); j++) {
      const topSanMove = json[j].san;
      const topGame = new Chess(game.fen());
      topGame.move(topSanMove);
      const topFen = topGame.fen();

      // Query the top pv, walk the pv and get its leaf score.
      const topUrl = `${apiQueryPv}${topFen}`;
      $.get(topUrl, function (topData, topStatus) {
        if (topStatus == "success" && topData.status == "ok") {
          const game1 = new Chess(topGame.fen());
          const depth = topData.depth - 1;
          if (depth >= 0) {
            for (let i = 0; i < depth; i++) {
              game1.move(topData.pvSAN[i]);
            }
            const leafFen = game1.fen();
            const url1 = `${apiQueryPv}${leafFen}`;
            $.get(url1, function (data1, status1) {
              if (status1 == "success" && data1.status == "ok") {
                score = data1.score;
                if (game.turn() !== game1.turn()) {
                  score = -1 * score;
                }
                const leafNodeInfo = `Eval of <b>${json[numPv - 1].san}</b> after ${1 + depth} plies: <b>${displayScore(score)}</b>`;
                document.getElementById(idStr).innerHTML = leafNodeInfo;
              }
            });
          }
        } else {
          document.getElementById(idStr).innerHTML = `Eval of <b>${json[numPv - 1].san}</b> after ${1} plies: <b>${displayScore(json[numPv - 1].score)}</b>`;
        }
      });
    }
  }
};

const probeBook = () => {
  removeArrows();
  // Get the fen from current board position
  const userfen = game.fen();
  const queryAllWithFen = apiQueryAll + userfen;
  const queryPvWithFen = apiQueryPv + userfen;

  // We will not make request if game is over.
  if (game.game_over()) {
    let msg = "Game over!";
    topMovePv.textContent = msg;
    for (let i = 0; i < amountAdvancedPvs; i++) {
      document.getElementById(`advance-pv${i + 1}`).textContent = `Pv${i + 1}: ${msg}`;
    }
    movesListTable.textContent = "";
    return;
  }

  // (1) Request query all
  $.get(queryAllWithFen, function (data, status) {
    if (typeof data.moves === "undefined") {
      movesListTable.textContent = "";
    } else {
      const json = data.moves;

      // Create table for book probing results
      // Clear table first
      movesListTable.textContent = "";

      for (let i = 0; i < json.length; i++) {
        const sanMove = json[i].san;
        const score = json[i].score;

        // Draw an arrow for every move that has the same eval as the top move
        if (arrowSwitch.checked && score == json[0].score) drawArrow(json[i].uci);

        const tr = `
          <tr ${i == 0 ? "id='topMove'" : ""} class="pointer" title="Click ${i == 0 ? "or right arrow " : ""}to move" onclick="doMove('${sanMove}')">
            <td>${sanMove}</td>
            <td>${displayScore(score)}</td>
          </tr>
        `;
        movesListTable.innerHTML += tr;
      }
    }
  });

  // Query leaf nodes
  if (leafNodeEvalsSwitch.checked) {
    $.get(queryAllWithFen, function (data, status) {
      for (let leafCount = 1; leafCount <= amountAdvancedPvs; leafCount++) {
        queryLeaf(data, leafCount);
      }
    });
  }

  // (2) Request PV of top 1 move and show it in PV box.
  if (topNodePvSwitch.checked) {
    $.get(queryPvWithFen, function (data, status) {
      if (status !== "success") {
        msg = "Request failed! PV query of top 1 move is not successful.";
        console.warn(msg);
        topMovePv.textContent = msg;
      } else if (data.status !== "ok") {
        if (!game.game_over()) {
          msg = "Request is successful but PV info is not available.";
          console.log(msg);
          topMovePv.textContent = msg;
        } else {
          topMovePv.textContent = "Game over!";
        }
      } else {
        let pv = "";
        for (let i = 0; i < data.pvSAN.length; i++) {
          const prevElements = data.pvSAN.slice(0, i);
          const currentElement = data.pvSAN[i];
          pv += `<div class="pvMove pointer rounded-1" title="Click ${i == 0 ? "or right arrow " : ""}to move" onclick="doMove('${[...prevElements, currentElement]}')">${currentElement}</div>`;
        }
        const line = `
          <div>
            Eval: <strong>${displayScore(data.score)}</strong>
            Depth: <strong>${data.depth}</strong>
          </div>
          <div class="d-flex flex-wrap">${pv}</div>
        `;
        topMovePv.innerHTML = line;
      }
    });
  }
};

// Alert user if game is over. Probe online book. Show the fen after
// each move. Update game result, fen and pgn boxes.
const updateStatus = () => {
  let moveColor = game.turn() === "b" ? "black" : "white";

  // checkmate?
  if (game.in_checkmate()) {
    moveColor === "black"
      ? game.header("Result", "1-0")
      : game.header("Result", "0-1");
  }
  // draw?
  else {
    game.in_draw()
      ? game.header("Result", "1/2-1/2")
      : game.header("Result", "*");
  }

  // Update the fen html PGN boxes
  inputFen.value = game.fen();
  inputPgn.value = game.pgn({ max_width: 70 });
  updateScreenshotLink();

  game.fen() === startpos
    ? (startBtn.disabled = true)
    : (startBtn.disabled = false);

  game.history().length == 0
    ? (undoBtn.disabled = true)
    : (undoBtn.disabled = false);

  chessDbEnoughPieces(game.fen())
    ? (requestBtn.disabled = false)
    : (requestBtn.disabled = true);

  // Probe the ChessDB online opening book.
  probeBook();

  // Get server stats
  getStats();
}; // End of updateStatus

const loadFEN = (fen) => {
  // Try to fix the fen before loading it
  // Field 1: position
  // Field 2: active player
  // Field 3: castling
  // Field 4: en passant square
  // Field 5: 50mr halfmoves
  // Field 6: fullmoves

  // Remove empty space at left/right of fen/epd string. Position copied
  // from Arena 3.5 chess GUI adds empty char at right of fen.
  fen = fen.trim();

  const fields = fen.split(" ").filter((e) => e !== "");

  if (fields.length === 1) fields.push("w");
  if (fields.length === 2) fields.push("-");
  if (fields.length === 3) fields.push("-");
  if (fields.length === 4) fields.push("0");
  if (fields.length === 5) fields.push("1");

  if (fields.length !== 6) {
    throw ["Invalid FEN: FEN has too many fields", fen];
  }

  if (fields[0].length > 64 + 7) {
    throw ["Invalid FEN: FEN has too many pieces", fen];
  }

  const countKings = fields[0].toLowerCase().split("k").length - 1;
  if (countKings !== 2) {
    throw ["Invalid FEN: Invalid amount of kings", fen];
  }

  fields[1] = fields[1].toLowerCase();
  if (fields[1] !== "w" && fields[1] !== "b") {
    throw ["Invalid FEN: Active player field", fen];
  }
  active = fields[1];

  halfmove = parseInt(fields[4]);
  if (Number.isNaN(halfmove)) {
    throw ["Invalid FEN: Halfmoves field", fen];
  }

  fullmove = parseInt(fields[5]);
  if (Number.isNaN(fullmove)) {
    throw ["Invalid FEN: Fullmoves field", fen];
  }

  fen = fields.join(" ");

  inputFen.value = fen;

  if (game.load(fen)) {
    board.position(fen);
    movesListTable.textContent = "";

    removeCssClass(highlightSquare);
    updateStatus();
  } else {
    throw ["Invalid FEN", fen];
  }
};

const loadPGN = (pgn) => {
  game.load_pgn(pgn, { sloppy: true });

  board.position(game.fen());
  movesListTable.textContent = "";

  removeCssClass(highlightSquare);
  addHighlightsFromHistory();
  updateStatus();
};

const undoMove = () => {
  game.undo();
  board.position(game.fen());

  removeCssClass(highlightSquare);
  addHighlightsFromHistory();
  updateStatus();
};

setupFenBtn.addEventListener("click", () => {
  try {
    loadFEN(inputFen.value);
  } catch (error) {
    console.warn(`${error[0]}\n${error[1]}`);
    alert(error[0]);
  }
});

setupPgnBtn.addEventListener("click", () => {
  loadPGN(inputPgn.value);
});

flipBtn.addEventListener("click", () => {
  board.flip(true);
  addHighlightsFromHistory();
  updateScreenshotLink();
  let arrowContainer = document.getElementById("arrowContainer");
  if (arrowContainer !== null) arrowContainer.classList.toggle("rotate180");
});

startBtn.addEventListener("click", () => {
  board.start(false);
  board.position(startpos);
  game.load(startpos);
  inputFen.value = "";
  inputPgn.value = "";
  removeCssClass(highlightSquare);
  updateStatus();
});

arrowSwitch.addEventListener("change", () => {
  if (arrowSwitch.checked) {
    localStorage.setItem("arrowSwitchState", true);
    updateStatus();
  } else {
    localStorage.setItem("arrowSwitchState", false);
    removeArrows();
  }
});

leafNodeEvalsSwitch.addEventListener("change", () => {
  if (leafNodeEvalsSwitch.checked) {
    advancePvs.style.display = "";
    localStorage.setItem("leafNodeEvalsSwitchState", true);
    updateStatus();
  } else {
    advancePvs.style.display = "none";
    localStorage.setItem("leafNodeEvalsSwitchState", false);
  }
});

topNodePvSwitch.addEventListener("change", () => {
  if (topNodePvSwitch.checked) {
    topMovePv.style.display = "";
    localStorage.setItem("topNodePvSwitchState", true);
    updateStatus();
  } else {
    topMovePv.style.display = "none";
    localStorage.setItem("topNodePvSwitchState", false);
  }
});

board = ChessBoard("board", cfg);
bookProbeResults.style.height = `${chessboardEl.clientHeight}px`;
updateStatus();

// Undo last move
undoBtn.addEventListener("click", undoMove);

requestBtn.addEventListener("click", requestQueue);

refreshBtn.addEventListener("click", updateStatus);

// Resize board on window resize
window.addEventListener("resize", () => {
  board.resize();
  bookProbeResults.style.height = `${chessboardEl.clientHeight}px`;
  addHighlightsFromHistory();
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.shiftKey && event.key === "V") {
    navigator.clipboard.readText()
      .then((text) => {
        try {
          loadFEN(text);
        } catch {
          loadPGN(text);
        }
      })
      .catch((err) => {
        console.error('Failed to read clipboard contents: ', err);
        if (err.name === 'NotAllowedError') {
          alert('Please grant permission to access the clipboard in your browser settings.');
        }
      });
  } else if (event.key === "ArrowRight") {
    document.getElementById("topMove")?.click();
  } else if (event.key === "ArrowLeft") {
    undoMove();
  }
});

// Download game in pgn format.
const download = (filename, text) => {
  const element = document.createElement("a");
  element.setAttribute(
    "href",
    "data:text/plain;charset=utf-8," + encodeURIComponent(text)
  );
  element.setAttribute("download", filename);

  element.style.display = "none";
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
};

// Start file download.
savePGNBtn.addEventListener("click", () => {
  const text = game.pgn({ max_width: 79, newline_char: "\n" }) + "\n\n";
  const filename = "mygame.pgn";
  download(filename, text);
});
