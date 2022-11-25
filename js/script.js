document.getElementById("fenbox").value = "";

var board,
  game = new Chess(),
  fenEl = $("#fen");
pgnEl = $("#pgn");
var $board = $("#board");
var squareToHighlight = null;
var squareClass = "square-55d63";

const apiUrl = "https://www.chessdb.cn/cdb.php";

setPgnGameHeader();

function removeHighlights() {
  $board.find(`.${squareClass}`).removeClass("highlight-sq");
}

function addHighlights(source, target) {
  $board.find(`.square-${source}`).addClass("highlight-sq");
  $board.find(`.square-${target}`).addClass("highlight-sq");
}

// Disable picking of pieces if the game is over. Also disable picking
// of pieces for the side not to move.
var onDragStart = function (source, piece, position, orientation) {
  if (
    game.game_over() === true ||
    (game.turn() === "w" && piece.search(/^b/) !== -1) ||
    (game.turn() === "b" && piece.search(/^w/) !== -1)
  ) {
    return false;
  }
};

var onDrop = function (source, target) {
  // see if the move is legal
  var move = game.move({
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

function onMoveEnd() {
  $board.find(`.square-${squareToHighlight}`).addClass("highlight-sq");
}

// update the board position after the piece snap
// for castling, en passant, pawn promotion
var onSnapEnd = function () {
  board.position(game.fen());
};

var cfg = {
  draggable: true,
  position: "start",
  onDragStart: onDragStart,
  onDrop: onDrop,
  onMoveEnd: onMoveEnd,
  onSnapEnd: onSnapEnd,
};

function doMove(move) {
  game.move(move);
  board.position(game.fen());

  // Remove square highlight of last move.
  removeHighlights();

  // Restore square highlight of last last move.
  moveHistory = game.history({ verbose: true });
  console.log(moveHistory);
  if (moveHistory.length >= 1) {
    lastMove = moveHistory[moveHistory.length - 1];
    addHighlights(lastMove.from, lastMove.to);
  }

  updateStatus();
}

function requestQueue() {
  $.get(`${apiUrl}?action=queue&board=${game.fen()}`);
  console.log("FEN requested");
  updateStatus();
}

function displayScore(score) {
  if (game.turn() === "b") score *= -1;
  if (score > 20000) return `White wins in ${30000 - score}`;
  if (score < -20000) return `Black wins in ${30000 + score}`;
  return score > 0 ? `+${(score / 100).toFixed(2)}` : (score / 100).toFixed(2);
}

// Query leaf score of top X move.
// Get the top move, push it, and query its PV. Walk the PV except the
// last move and query its PV again to get its leaf node score.
function queryLeaf(data, numPv) {
  var idStr = `advance-pv${numPv}`;
  var label = `Pv ${numPv}: `;
  document.getElementById(idStr).innerHTML = label;
  if (typeof data.moves === "undefined") {
    console.log("Query all, there is no book move!");
  } else {
    var json = data.moves;
    for (var j = numPv - 1; j < Math.min(numPv, json.length); j++) {
      var topSanMove = json[j].san;
      var topGame = new Chess(game.fen());
      topGame.move(topSanMove);
      var topFen = topGame.fen();

      // Query the top pv, walk the pv and get its leaf score.
      var topUrl = `${apiUrl}?action=querypv&json=1&board=${topFen}`;
      $.get(topUrl, function (topData, topStatus) {
        if (topStatus == "success" && topData.status == "ok") {
          var game1 = new Chess(topGame.fen());
          var depth = topData.depth - 1;
          if (depth >= 0) {
            for (var i = 0; i < depth; i++) {
              game1.move(topData.pvSAN[i]);
            }
            var leafFen = game1.fen();
            var url1 = `${apiUrl}?action=querypv&json=1&board=${leafFen}`;
            $.get(url1, function (data1, status1) {
              if (status1 == "success" && data1.status == "ok") {
                score = data1.score;
                if (game.turn() !== game1.turn()) {
                  score = -1 * score;
                }
                var leafNodeInfo = `Eval of <b>${
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

var probe_book = function () {
  var baseUrl = `${apiUrl}?action=queryall&json=1&board=`;
  var pvUrl = `${apiUrl}?action=querypv&json=1&board=`;

  // Get the fen from current board position
  var userfen = game.fen();
  var url = baseUrl + userfen;
  var pvUrlGet = pvUrl + userfen;

  // We will not make request if game is over.
  if (game.game_over()) {
    var msg = "Game over!";
    console.log(msg);
    document.getElementById("top-move-pv").textContent = msg;
    for (var i = 0; i < 4; i++) {
      document.getElementById(`advance-pv${i + 1}`).textContent = `Pv${
        i + 1
      }: ${msg}`;
    }
    $("#tbody tr").remove();
    return;
  }

  // (1) Request query all
  $.get(url, function (data, status) {
    if (typeof data.moves === "undefined") {
      $("#tbody tr").remove();
    } else {
      var json = data.moves;

      // Create table for book probing results
      // Clear table first
      $("#tbody tr").remove();

      var tbody = document.getElementById("tbody");

      for (var i = 0; i < json.length; i++) {
        var sanMove = json[i].san;
        var score = json[i].score;

        var tr = `
          <tr onclick="doMove('${sanMove}')">
            <td>${sanMove}</td>
            <td>${displayScore(score)}</td>
          </tr>
        `;
        tbody.innerHTML += tr;
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
      console.log(msg);
      document.getElementById("top-move-pv").textContent = msg;
    } else if (data.status !== "ok") {
      if (!game.game_over()) {
        msg = "Request is successful but PV info is not available.";
        console.log(msg);
        document.getElementById("top-move-pv").textContent = msg;
      } else {
        document.getElementById("top-move-pv").textContent = "Game over!";
      }
    } else {
      var sanPv = "" + data.pvSAN;
      var pv = sanPv.replace(/,/g, " ");
      var line = `Eval: ${displayScore(data.score)} Depth: ${
        data.depth
      }<br>${pv}`;
      document.getElementById("top-move-pv").innerHTML = line;
    }
  });
};

// Alert user if game is over. Probe online book. Show the fen after
// each move. Update game result, fen and pgn boxes.
var updateStatus = function () {
  var moveColor = "White";
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
  fenEl.html(game.fen());
  pgnEl.html(game.pgn({ max_width: 79, newline_char: "<br />" }));
}; // End of updateStatus

$("#clearPosBoxBtn").on("click", function () {
  document.getElementById("fenbox").value = "";
});

$("#inputEpdBtn").on("click", function () {
  var pos = document.getElementById("fenbox").value;

  // Remove empty space at left/right of fen/epd string. Position copied
  // from Arena 3.5 chess GUI adds empty char at right of fen.
  pos = pos.trim();
  document.getElementById("fenbox").value = pos;

  var ok = game.load(pos);
  if (ok) {
    setPgnGameHeader();
    board.position(pos);
    var s = document.getElementById("tbody");
    s.innerHTML = "";

    removeHighlights();
    updateStatus();
  } else {
    console.log(`FEN loading is not OK! FEN: ${pos}`);
    alert("The fen/epd that you set up is illegal!");
  }
});

$("#flipBtn").on("click", function () {
  board.flip(true);
});

$("#startBtn").on("click", function () {
  board.start(false);
  var startpos = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  board.position(startpos);
  game.load(startpos);
  document.getElementById("fenbox").value = "";
  removeHighlights();
  setPgnGameHeader();
  updateStatus();
});

board = ChessBoard("board", cfg);
updateStatus();

// Undo last move
$("#undoBtn").on("click", function () {
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

$("#requestBtn").on("click", requestQueue);

$("#refreshBtn").on("click", updateStatus);

function setPgnGameHeader() {
  // Get Date for Date game header tag.
  var today = new Date();
  var dd = today.getDate();
  var mm = today.getMonth() + 1; //January is 0!

  var yyyy = today.getFullYear();
  if (dd < 10) dd = "0" + dd;
  if (mm < 10) mm = "0" + mm;
  var today = yyyy + "." + mm + "." + dd;

  // Add other header tags
  game.header("Event", "ChessDB book probing");
  game.header("Site", "Online");
  game.header("Date", today);
  game.header("Round", "-");
  game.header("White", "?");
  game.header("Black", "?");
}

// Download game in pgn format.
function download(filename, text) {
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
document.getElementById("savePGNBtn").addEventListener(
  "click",
  function () {
    var text = game.pgn({ max_width: 79, newline_char: "\n" }) + "\n\n";
    var filename = "mygame.pgn";
    download(filename, text);
  },
  false
);
