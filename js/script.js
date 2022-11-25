const startpos = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  fenEl = document.getElementById("fen"),
  pgnEl = document.getElementById("pgn"),

  inputFen = document.getElementById("inputFenBox"),
  inputPgn = document.getElementById("inputPgnBox"),

  setupFenBtn = document.getElementById("setupFenBtn"),
  setupPgnBtn = document.getElementById("setupPgnBtn"),

  startBtn = document.getElementById("startBtn"),
  undoBtn = document.getElementById("undoBtn"),
  flipBtn = document.getElementById("flipBtn"),
  requestBtn = document.getElementById("requestBtn"),
  refreshBtn = document.getElementById("refreshBtn"),

  topMovePv = document.getElementById("topMovePv"),
  movesListTable  = document.getElementById("movesList"),
  $board = document.getElementById("board"),
  squareClass = "square-55d63",
  apiUrl = "https://www.chessdb.cn/cdb.php";

let board,
  game = new Chess();

const removeHighlights = () => {
  $board.querySelectorAll('.highlight-sq').forEach(square => square.classList.remove("highlight-sq"));
}

const addHighlights = (source, target) => {
  $board.querySelector(`.square-${source}`).classList.add("highlight-sq");
  $board.querySelector(`.square-${target}`).classList.add("highlight-sq");
}

// Disable picking of pieces if the game is over. Also disable picking
// of pieces for the side not to move.
const onDragStart = (source, piece) => {
  if (
    game.game_over() === true ||
    (game.turn() === "w" && piece.search(/^b/) !== -1) ||
    (game.turn() === "b" && piece.search(/^w/) !== -1)
  ) {
    return false;
  }
};

const onDrop = (source, target) => {
  // see if the move is legal
  const move = game.move({
    from: source,
    to: target,
    promotion: "q", // NOTE: always promote to a queen for example simplicity
  });

  // illegal move
  if (move === null) return "snapback";

  // Hight the last move made
  removeHighlights();
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
};

const doMove = (move) => {
  game.move(move);
  board.position(game.fen());

  // Remove square highlight of last move.
  removeHighlights();

  // Restore square highlight of last last move.
  moveHistory = game.history({ verbose: true });
  if (moveHistory.length >= 1) {
    lastMove = moveHistory[moveHistory.length - 1];
    addHighlights(lastMove.from, lastMove.to);
  }

  updateStatus();
}

const requestQueue = () => {
  $.get(`${apiUrl}?action=queue&board=${game.fen()}`);
  console.log("FEN requested");
  updateStatus();
}

const displayScore = (score) => {
  if (game.turn() === "b") score *= -1;
  if (score > 20000) return `White wins in ${30000 - score}`;
  if (score < -20000) return `Black wins in ${30000 + score}`;
  return score > 0 ? `+${(score / 100).toFixed(2)}` : (score / 100).toFixed(2);
}

const countPieces = (fen, attackers = false) => {
  let board = fen.toLowerCase().split(" ")[0].split("");
  pieces = "qrbn";
  if (!attackers) pieces += "kp";
  const count =
    board.length -
    board.filter((fenPiece) => !pieces.includes(fenPiece)).length;
  return count;
}

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
      const topUrl = `${apiUrl}?action=querypv&json=1&board=${topFen}`;
      $.get(topUrl, function (topData, topStatus) {
        if (topStatus == "success" && topData.status == "ok") {
          const game1 = new Chess(topGame.fen());
          const depth = topData.depth - 1;
          if (depth >= 0) {
            for (let i = 0; i < depth; i++) {
              game1.move(topData.pvSAN[i]);
            }
            const leafFen = game1.fen();
            const url1 = `${apiUrl}?action=querypv&json=1&board=${leafFen}`;
            $.get(url1, function (data1, status1) {
              if (status1 == "success" && data1.status == "ok") {
                score = data1.score;
                if (game.turn() !== game1.turn()) {
                  score = -1 * score;
                }
                const leafNodeInfo = `Eval of <b>${
                  json[numPv - 1].san
                }</b> after ${1 + depth} plies: <b>${displayScore(score)}</b>`;
                document.getElementById(idStr).innerHTML = leafNodeInfo;
              }
            });
          }
        } else {
          document.getElementById(idStr).innerHTML = `Eval of <b>${
            json[numPv - 1].san
          }</b> after ${1} plies: <b>${displayScore(
            json[numPv - 1].score
          )}</b>`;
        }
      });
    }
  }
}

const probe_book = () => {
  const baseUrl = `${apiUrl}?action=queryall&json=1&board=`;
  const pvUrl = `${apiUrl}?action=querypv&json=1&board=`;

  // Get the fen from current board position
  const userfen = game.fen();
  const url = baseUrl + userfen;
  const pvUrlGet = pvUrl + userfen;

  // We will not make request if game is over.
  if (game.game_over()) {
    let msg = "Game over!";
    topMovePv.textContent = msg;
    for (let i = 0; i < 4; i++) {
      document.getElementById(`advance-pv${i + 1}`).textContent = `Pv${
        i + 1
      }: ${msg}`;
    }
    movesListTable.textContent = "";
    return;
  }

  // (1) Request query all
  $.get(url, function (data, status) {
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

        const tr = `
          <tr onclick="doMove('${sanMove}')">
            <td>${sanMove}</td>
            <td>${displayScore(score)}</td>
          </tr>
        `;
        movesListTable.innerHTML += tr;
      }
    }
  });

  $.get(url, function (data, status) {
    for (let leafCount = 1; leafCount <= 4; leafCount++) {
      queryLeaf(data, leafCount);
    }
  });

  // (2) Request PV of top 1 move and show it in PV box.
  $.get(pvUrlGet, function (data, status) {
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
      var sanPv = "" + data.pvSAN;
      var pv = sanPv.replace(/,/g, " ");
      var line = `Eval: ${displayScore(data.score)} Depth: ${
        data.depth
      }<br>${pv}`;
      topMovePv.innerHTML = line;
    }
  });
};

// Alert user if game is over. Probe online book. Show the fen after
// each move. Update game result, fen and pgn boxes.
const updateStatus = () => {
  let moveColor = "White";
  if (game.turn() === "b") moveColor = "Black";

  // checkmate?
  if (game.in_checkmate() === true) {
    if (moveColor === "Black") game.header("Result", "1-0");
    else game.header("Result", "0-1");
  }
  // draw?
  else if (game.in_draw() === true) game.header("Result", "1/2-1/2");
  else {
    game.header("Result", "*");
  }

  // Probe the ChessDB online opening book.
  probe_book();

  // Update the fen html PGN boxes
  fenEl.textContent = game.fen();
  pgnEl.innerHTML = game.pgn({ max_width: 79, newline_char: "<br />" });

  if (game.fen() === startpos) {
    startBtn.disabled = true;
  } else {
    startBtn.disabled = false;
  }

  if (game.history().length == 0) {
    undoBtn.disabled = true;
  } else {
    undoBtn.disabled = false;
  }

  if (countPieces(game.fen()) >= 10 && countPieces(game.fen(), true) >= 4) {
    requestBtn.disabled = false;
  } else {
    requestBtn.disabled = true;
  }
}; // End of updateStatus

setupFenBtn.addEventListener("click", () => {
  // Remove empty space at left/right of fen/epd string. Position copied
  // from Arena 3.5 chess GUI adds empty char at right of fen.
  const input = inputFen.value.trim();

  inputFen.value = input;

  if (game.load(input)) {
    setPgnGameHeader();
    board.position(input);
    movesListTable.textContent = "";

    removeHighlights();
    updateStatus();
  } else {
    console.warn(`Invalid FEN\n${input}`);
    alert("Invalid FEN");
  }
});

setupPgnBtn.addEventListener("click", () => {
  const input = inputPgn.value;

  if (game.load_pgn(input)) {
    setPgnGameHeader();
    board.position(game.fen());
    movesListTable.textContent = "";

    // Remove square highlight of last move.
    removeHighlights();

    // Restore square highlight of last last move.
    moveHistory = game.history({ verbose: true });
    if (moveHistory.length >= 1) {
      lastMove = moveHistory[moveHistory.length - 1];
      addHighlights(lastMove.from, lastMove.to);
    }
    updateStatus();
  } else {
    console.warn(`Invalid PGN\n${input}`);
    alert("Invalid PGN");
  }
});

flipBtn.addEventListener("click", () => {
  board.flip(true);
});

startBtn.addEventListener("click", () => {
  board.start(false);
  board.position(startpos);
  game.load(startpos);
  inputFen.value = "";
  inputPgn.value = "";
  removeHighlights();
  setPgnGameHeader();
  updateStatus();
});

board = ChessBoard("board", cfg);
updateStatus();

// Undo last move
undoBtn.addEventListener("click", () => {
  game.undo();
  board.position(game.fen());

  // Remove square highlight of last move.
  removeHighlights();

  // Restore square highlight of last last move.
  moveHistory = game.history({ verbose: true });
  if (moveHistory.length >= 1) {
    lastMove = moveHistory[moveHistory.length - 1];
    addHighlights(lastMove.from, lastMove.to);
  }

  updateStatus();
});

requestBtn.addEventListener("click", requestQueue);

refreshBtn.addEventListener("click", updateStatus);

const setPgnGameHeader = () => {
  // Get Date for Date game header tag.
  let today = new Date(),
    dd = today.getDate(),
    mm = today.getMonth() + 1; //January is 0!

  const yyyy = today.getFullYear();

  if (dd < 10) dd = `0${dd}`;
  if (mm < 10) mm = `0${mm}`;

  today = `${yyyy}.${mm}.${dd}`;

  // Add other header tags
  game.header("Event", "ChessDB book probing");
  game.header("Site", "Online");
  game.header("Date", today);
  game.header("Round", "-");
  game.header("White", "?");
  game.header("Black", "?");
}

setPgnGameHeader();

// Download game in pgn format.
const download = (filename, text) => {
  var element = document.createElement("a");
  element.setAttribute(
    "href",
    "data:text/plain;charset=utf-8," + encodeURIComponent(text)
  );
  element.setAttribute("download", filename);

  element.style.display = "none";
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}

// Start file download.
savePGNBtn.addEventListener("click", () => {
  const text = game.pgn({ max_width: 79, newline_char: "\n" }) + "\n\n";
  const filename = "mygame.pgn";
  download(filename, text);
});
