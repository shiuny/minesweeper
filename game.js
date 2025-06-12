const DIFFICULTIES = {
    easy: { size: 9, width: 9, mines: 10 },
    medium: { size: 16, width: 16, mines: 40 },
    hard: { size: 16, width: 30, mines: 99 }
};

const gameState = {
    size: 0,
    width: 0,
    mines: 0,
    grid: [],
    revealedCells: [],
    flaggedCells: [],
    gameOver: false,
    currentDifficulty: '',
    flagMode: false,
    selectedCell: null,
    lastClickTime: 0,
    lastClickCell: null,
    rafId: null,
    eventListeners: [],
    buttonListeners: [],
    isDragging: false,
    touchStartPos: { x: 0, y: 0 },
    initialScroll: { left: 0, top: 0 }
};

const touchThreshold = 400;
const dragThreshold = 10;

const helpContent = `
    <h2>マインスイーパのルール</h2>
    <p>マインスイーパは、地雷を避けながら全ての安全なマスを開けるロジックパズルゲームです。開始時に安全地帯が自動で開きます。</p>
    <h3>ルール</h3>
    <ul>
        <li>グリッド上のマスをクリック（タップ）して選択、操作で開く/フラグ。</li>
        <li>数字は周囲8マスの地雷の数を表します（例：「2」は周囲に2つの地雷）。</li>
        <li>地雷（💣）を開くとゲームオーバーです。</li>
        <li>フラグモードOFF: タップで選択（赤枠）、⛏️で開く、🚩でフラグ、⛏️自動開放で周囲を開く（数字＝フラグ数時）。ON: タップ/クリックでフラグ。</li>
        <li>全ての安全なマスを開けば勝利です！</li>
    </ul>
    <h3>操作方法</h3>
    <ul>
        <li><b>PC</b>: 左クリックで選択/開く（フラグモードOFF）またはフラグ（ON）、右クリックでフラグ、ダブルクリックで周囲を開く（数字＝フラグ数時）。</li>
        <li><b>スマホ/タブレット</b>: フラグモードOFF: タップで選択（赤枠）、⛏️で開く、🚩でフラグ、ダブルタップで周囲を開く。ON: タップでフラグ。</li>
        <li><b>スクロール</b>: 一本指ドラッグでスクロール。</li>
        <li><b>フラグモード</b>: トグルボタンで切り替え。ON時は⛏️/🚩/自動開放無効。</li>
    </ul>
    <h3>ヒント</h3>
    <p>安全地帯から始め、数字をヒントに地雷を特定。フラグモードで誤タップを防ぎ、自動開放で効率化！</p>
    <button onclick="closeHelp()">閉じる</button>
`;

function startGame(difficulty) {
    console.log(`Starting game with difficulty: ${difficulty}`);
    try {
        if (!DIFFICULTIES[difficulty]) throw new Error(`Invalid difficulty: ${difficulty}`);
        gameState.currentDifficulty = difficulty;
        const config = DIFFICULTIES[difficulty];
        gameState.size = config.size;
        gameState.width = config.width;
        gameState.mines = config.mines;

        const gridElement = document.querySelector('#grid');
        const container = document.querySelector('#grid-container');
        if (!gridElement || !container) throw new Error('Grid or container not found');

        gridElement.style.gridTemplateColumns = `repeat(${gameState.width}, 22px)`;
        const totalWidth = gameState.width * 22 + 2; // 左ボーダーを考慮
        gridElement.style.width = `${totalWidth}px`;
        container.style.width = `${totalWidth + 2}px`; // 右ボーダーを考慮

        const totalHeight = gameState.size * 22;
        container.style.minHeight = `${totalHeight + 4}px`; // 上下ボーダーを考慮

        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const initialScrollLeft = 0; // 左端から開始
        container.scrollTo(initialScrollLeft, 0);

        if (window.matchMedia('(max-width: 360px)').matches) {
            gridElement.style.width = `${18 * gameState.width + 2}px`;
            container.style.width = `${18 * gameState.width + 4}px`;
            const cells = document.querySelectorAll('.cell');
            cells.forEach(cell => {
                cell.style.width = '18px';
                cell.style.height = '18px';
                cell.style.minWidth = '18px';
                cell.style.minHeight = '18px';
            });
        }

        console.log(`Viewport width: ${viewportWidth}, Grid width: ${totalWidth}, Container width: ${container.offsetWidth}, Initial scrollLeft: ${initialScrollLeft}`);

        initGameGrid();
        if (difficulty === 'hard' && !sessionStorage.getItem('hardModeBanner')) {
            setTimeout(showHardModeBanner, 500);
        }
    } catch (e) {
        console.error('startGame error:', e);
        updateStatus('error', `エラー: 開始失敗。原因: ${e.message}。ページをリロードしてください。`);
    }
}

function initGameGrid() {
    console.log('Initializing game grid');
    try {
        gameState.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        gameState.eventListeners = [];
        gameState.buttonListeners.forEach(([id, handler]) => {
            const button = document.querySelector(`#${id}`);
            if (button) button.removeEventListener('click', handler);
        });
        gameState.buttonListeners = [];

        gameState.grid = Array(gameState.size).fill().map(() => Array(gameState.width).fill(0));
        gameState.revealedCells = Array(gameState.size).fill().map(() => Array(gameState.width).fill(false));
        gameState.flaggedCells = Array(gameState.size).fill().map(() => Array(gameState.width).fill(false));
        gameState.gameOver = false;
        gameState.flagMode = false;
        gameState.selectedCell = null;
        gameState.lastClickTime = 0;
        gameState.lastClickCell = null;
        if (gameState.rafId) cancelAnimationFrame(gameState.rafId);
        gameState.rafId = null;

        const flagModeButton = document.querySelector('#flag-mode');
        const status = document.querySelector('#status');
        const modalContent = document.querySelector('#modal-content');
        if (flagModeButton) flagModeButton.textContent = '🔍 フラグモード: OFF';
        if (status) {
            status.textContent = `地雷: ${gameState.mines}`;
            status.classList.remove('game-over', 'cleared', 'error');
        }
        if (modalContent) modalContent.innerHTML = helpContent;

        ['open-cell-button', 'flag-button', 'auto-open-button'].forEach(id => {
            const button = document.querySelector(`#${id}`);
            if (button) button.disabled = true;
        });

        const safeRow = Math.floor(Math.random() * (gameState.size - 2)) + 1;
        const safeCol = Math.floor(Math.random() * (gameState.width - 2)) + 1;
        console.log(`Safe zone at (${safeRow}, ${safeCol})`);
        placeMines(safeRow, safeCol);
        openSafeZone(safeRow, safeCol);

        renderGrid();
        bindEventListeners();
        bindButtonEvents();
    } catch (e) {
        console.error('initGameGrid error:', e);
        updateStatus('error', `エラー: 初期化失敗。原因: ${e.message}。ページをリロードしてください。`);
    }
}

function bindEventListeners() {
    const container = document.querySelector('#grid-container');
    if (container) {
        const touchStartHandler = (e) => handleTouchStart(e);
        const touchMoveHandler = (e) => handleTouchMove(e);
        const touchEndHandler = (e) => handleTouchEnd(e);
        container.addEventListener('touchstart', touchStartHandler, { passive: false });
        container.addEventListener('touchmove', touchMoveHandler, { passive: false });
        container.addEventListener('touchend', touchEndHandler, { passive: true });
        gameState.eventListeners.push(
            { element: container, event: 'touchstart', handler: touchStartHandler },
            { element: container, event: 'touchmove', handler: touchMoveHandler },
            { element: container, event: 'touchend', handler: touchEndHandler }
        );
    }
}

function bindButtonEvents() {
    console.log('Binding button events');
    try {
        const buttons = {
            'easy-button': () => startGame('easy'),
            'medium-button': () => startGame('medium'),
            'hard-button': () => startGame('hard'),
            'reset-button': resetGame,
            'flag-mode': toggleFlagMode,
            'help-button': showHelp,
            'open-cell-button': openSelectedCell,
            'flag-button': placeFlagOnSelected,
            'auto-open-button': autoOpenSelected
        };
        Object.entries(buttons).forEach(([id, handler]) => {
            const button = document.querySelector(`#${id}`);
            if (button) {
                if (button._handler) button.removeEventListener('click', button._handler);
                button._handler = handler;
                button.addEventListener('click', handler);
                gameState.buttonListeners.push([id, handler]);
            }
        });
    } catch (e) {
        console.error('bindButtonEvents error:', e);
        updateStatus('error', `エラー: ボタン設定。原因: ${e.message}。ページをリロードしてください。`);
    }
}

function openSafeZone(row, col) {
    console.log(`Opening safe zone at (${row}, ${col})`);
    const cellsToUpdate = [];
    for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
            const ni = row + di, nj = col + dj;
            if (ni >= 0 && ni < gameState.size && nj >= 0 && nj < gameState.width) {
                revealCell(ni, nj, cellsToUpdate, true);
                cellsToUpdate.push({ row: ni, col: nj });
            }
        }
    }
    renderGrid(cellsToUpdate);
}

function placeMines(safeRow, safeCol) {
    console.log(`Placing ${gameState.mines} mines, avoiding 3x3 at (${safeRow}, ${safeCol})`);
    let minesPlaced = 0;
    const candidates = [];
    for (let i = 0; i < gameState.size; i++) {
        for (let j = 0; j < gameState.width; j++) {
            if (Math.abs(i - safeRow) > 1 || Math.abs(j - safeCol) > 1) {
                candidates.push([i, j]);
            }
        }
    }
    if (candidates.length < gameState.mines) throw new Error(`Not enough cells (${candidates.length}) for ${gameState.mines} mines`);
    while (minesPlaced < gameState.mines && candidates.length > 0) {
        const index = Math.floor(Math.random() * candidates.length);
        const [r, c] = candidates.splice(index, 1)[0];
        gameState.grid[r][c] = 'mine';
        minesPlaced++;
    }
    if (minesPlaced !== gameState.mines) throw new Error(`Placed ${minesPlaced} mines, expected ${gameState.mines}`);
    for (let i = 0; i < gameState.size; i++) {
        for (let j = 0; j < gameState.width; j++) {
            if (gameState.grid[i][j] !== 'mine') {
                gameState.grid[i][j] = countMines(i, j);
            }
        }
    }
}

function countMines(row, col) {
    let count = 0;
    for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
            const ni = row + di, nj = col + dj;
            if (ni >= 0 && ni < gameState.size && nj >= 0 && nj < gameState.width && gameState.grid[ni][nj] === 'mine') {
                count++;
            }
        }
    }
    return count;
}

function countFlags(row, col) {
    let count = 0;
    for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
            const ni = row + di, nj = col + dj;
            if (ni >= 0 && ni < gameState.size && nj >= 0 && nj < gameState.width && gameState.flaggedCells[ni][nj]) {
                count++;
            }
        }
    }
    return count;
}

function renderGrid(cellsToUpdate = null) {
    console.log(`Rendering grid: ${gameState.size}x${gameState.width}, partial=${!!cellsToUpdate}`);
    try {
        const gridElement = document.querySelector('#grid');
        if (!gridElement) throw new Error('Grid element not found');
        if (!gameState.grid || !gameState.grid[0]) throw new Error('Grid state not initialized');

        if (!cellsToUpdate) {
            gridElement.innerHTML = '';
            gridElement.style.gridTemplateColumns = `repeat(${gameState.width}, 22px)`;
            const totalWidth = gameState.width * 22 + 2;
            gridElement.style.width = `${totalWidth}px`;
            for (let i = 0; i < gameState.size; i++) {
                for (let j = 0; j < gameState.width; j++) {
                    const cell = document.createElement('div');
                    cell.className = 'cell';
                    cell.dataset.row = i;
                    cell.dataset.col = j;
                    updateCellDisplay(cell, i, j);
                    cell.addEventListener('click', handleClick);
                    cell.addEventListener('contextmenu', handleRightClick);
                    gridElement.appendChild(cell);
                }
            }
        } else {
            cellsToUpdate.forEach(({ row, col }) => {
                const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
                if (cell) {
                    cell.className = 'cell';
                    updateCellDisplay(cell, row, col);
                }
            });
        }
        updateButtonStates();
        if (!gameState.gameOver) updateStatus();
    } catch (e) {
        console.error('renderGrid error:', e);
        updateStatus('error', `エラー: グリッド描画。原因: ${e.message}。ページをリロードしてください。`);
    }
}

function updateCellDisplay(cell, row, col) {
    cell.className = 'cell';
    if (gameState.revealedCells[row][col]) {
        cell.classList.add('opened');
        if (gameState.grid[row][col] === 'mine') {
            cell.classList.add('mine');
        } else if (gameState.grid[row][col] > 0) {
            cell.textContent = gameState.grid[row][col];
            cell.dataset.value = gameState.grid[row][col];
        }
    } else if (gameState.flaggedCells[row][col]) {
        cell.classList.add('flagged');
    }
    if (gameState.selectedCell && gameState.selectedCell.row === row && gameState.selectedCell.col === col && !gameState.flagMode) {
        cell.classList.add('selected');
    }
}

function updateButtonStates() {
    const openCellButton = document.querySelector('#open-cell-button');
    const flagButton = document.querySelector('#flag-button');
    const autoOpenButton = document.querySelector('#auto-open-button');
    const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
    if (openCellButton) openCellButton.disabled = !gameState.selectedCell || gameState.flagMode || gameState.gameOver || !isMobile;
    if (flagButton) flagButton.disabled = !gameState.selectedCell || gameState.flagMode || gameState.gameOver || !isMobile;
    if (autoOpenButton) autoOpenButton.disabled = !gameState.selectedCell || gameState.flagMode || gameState.gameOver || !isMobile || !isChordingPossible();
}

function isChordingPossible() {
    if (!gameState.selectedCell || !gameState.revealedCells[gameState.selectedCell.row][gameState.selectedCell.col]) {
        return false;
    }
    const row = gameState.selectedCell.row;
    const col = gameState.selectedCell.col;
    const value = gameState.grid[row][col];
    if (typeof value !== 'number' || value <= 0) {
        return false;
    }
    const flagCount = countFlags(row, col);
    return flagCount === value;
}

function handleClick(e) {
    if (gameState.gameOver) return;
    const row = parseInt(e.target.dataset.row, 10);
    const col = parseInt(e.target.dataset.col, 10);
    if (isNaN(row) || isNaN(col)) {
        console.warn('Invalid cell click:', e.target.dataset);
        return;
    }
    console.log(`Clicked cell (${row}, ${col}), flagMode=${gameState.flagMode}`);
    if (gameState.flagMode) {
        if (!gameState.revealedCells[row][col]) {
            const flagCount = gameState.flaggedCells.flat().filter(f => f).length;
            if (!gameState.flaggedCells[row][col] && flagCount >= gameState.mines) return;
            gameState.flaggedCells[row][col] = !gameState.flaggedCells[row][col];
            gameState.selectedCell = null;
            renderGrid([{ row, col }]);
        }
    } else {
        const currentTime = Date.now();
        if (gameState.lastClickCell && gameState.lastClickCell.row === row && gameState.lastClickCell.col === col && currentTime - gameState.lastClickTime < touchThreshold) {
            console.log(`Double-click detected at (${row}, ${col})`);
            gameState.selectedCell = { row, col };
            handleChording(row, col);
        } else {
            handleCellClick(row, col);
        }
        gameState.lastClickTime = currentTime;
        gameState.lastClickCell = { row, col };
    }
}

function handleRightClick(e) {
    e.preventDefault();
    if (gameState.gameOver) return;
    const row = parseInt(e.target.dataset.row, 10);
    const col = parseInt(e.target.dataset.col, 10);
    if (isNaN(row) || isNaN(col)) {
        console.warn('Invalid right-click:', e.target.dataset);
        return;
    }
    console.log(`Right-clicked cell (${row}, ${col})`);
    if (!gameState.revealedCells[row][col]) {
        const flagCount = gameState.flaggedCells.flat().filter(f => f).length;
        if (!gameState.flaggedCells[row][col] && flagCount >= gameState.mines) return;
        gameState.flaggedCells[row][col] = !gameState.flaggedCells[row][col];
        gameState.selectedCell = null;
        renderGrid([{ row, col }]);
    }
}

function handleTouchStart(e) {
    if (gameState.gameOver || e.touches.length !== 1) return;
    e.preventDefault();

    const touch = e.touches[0];
    const container = document.querySelector('#grid-container');

    gameState.isDragging = false;
    gameState.touchStartPos = { x: touch.clientX, y: touch.clientY };
    gameState.initialScroll = { left: container.scrollLeft, top: container.scrollTop };
}

function handleTouchMove(e) {
    if (gameState.gameOver || e.touches.length !== 1) return;
    e.preventDefault();

    const touch = e.touches[0];
    const dx = touch.clientX - gameState.touchStartPos.x;
    const dy = touch.clientY - gameState.touchStartPos.y;

    if (!gameState.isDragging && Math.sqrt(dx * dx + dy * dy) > dragThreshold) {
        gameState.isDragging = true;
        if (gameState.selectedCell) {
            const prevSelected = { ...gameState.selectedCell };
            gameState.selectedCell = null;
            renderGrid([{row: prevSelected.row, col: prevSelected.col}]);
        }
    }

    if (gameState.isDragging) {
        if (gameState.rafId) cancelAnimationFrame(gameState.rafId);
        gameState.rafId = requestAnimationFrame(() => {
            const container = document.querySelector('#grid-container');
            if (container) {
                const newScrollLeft = Math.max(0, gameState.initialScroll.left - dx);
                container.scrollLeft = newScrollLeft;
                container.scrollTop = gameState.initialScroll.top - dy;
            }
        });
    }
}

function handleTouchEnd(e) {
    if (gameState.rafId) {
        cancelAnimationFrame(gameState.rafId);
        gameState.rafId = null;
    }

    if (!gameState.isDragging) {
        const target = document.elementFromPoint(gameState.touchStartPos.x, gameState.touchStartPos.y);
        if (!target || !target.classList.contains('cell')) return;

        const row = parseInt(target.dataset.row, 10);
        const col = parseInt(target.dataset.col, 10);
        if (isNaN(row) || isNaN(col)) return;

        console.log(`Tap gesture on cell (${row}, ${col}), flagMode=${gameState.flagMode}`);

        if (gameState.flagMode) {
            if (!gameState.revealedCells[row][col]) {
                const flagCount = gameState.flaggedCells.flat().filter(f => f).length;
                if (!gameState.flaggedCells[row][col] && flagCount >= gameState.mines) return;
                gameState.flaggedCells[row][col] = !gameState.flaggedCells[row][col];
                renderGrid([{ row, col }]);
            }
        } else {
            const prevSelectedCell = gameState.selectedCell ? { ...gameState.selectedCell } : null;
            const currentTime = Date.now();

            if (gameState.selectedCell && gameState.selectedCell.row === row && gameState.selectedCell.col === col) {
                if (currentTime - gameState.lastClickTime < touchThreshold) {
                    console.log(`Double-tap detected at (${row}, ${col})`);
                    handleChording(row, col);
                } else {
                    openSelectedCell();
                }
            } else {
                gameState.selectedCell = { row, col };
                const cellsToUpdate = [{ row, col }];
                if (prevSelectedCell) cellsToUpdate.push(prevSelectedCell);
                renderGrid(cellsToUpdate);
            }
            gameState.lastClickTime = currentTime;
        }
    }

    gameState.isDragging = false;
}

function handleCellClick(row, col) {
    if (gameState.flagMode || gameState.flaggedCells[row][col] || gameState.revealedCells[row][col]) return;
    const prevSelectedCell = gameState.selectedCell ? { row: gameState.selectedCell.row, col: gameState.selectedCell.col } : null;
    const cellsToUpdate = [];
    revealCell(row, col, cellsToUpdate);
    gameState.selectedCell = null;
    cellsToUpdate.push({ row, col });
    if (prevSelectedCell) cellsToUpdate.push(prevSelectedCell);
    renderGrid(cellsToUpdate);
    if (!gameState.gameOver) checkWin();
}

function handleChording(row, col) {
    if (gameState.gameOver || !gameState.revealedCells[row][col] || gameState.grid[row][col] <= 0) return;
    const flagCount = countFlags(row, col);
    if (flagCount === gameState.grid[row][col]) {
        const cellsToUpdate = [];
        for (let di = -1; di <= 1; di++) {
            for (let dj = -1; dj <= 1; dj++) {
                const ni = row + di, nj = col + dj;
                if (ni >= 0 && ni < gameState.size && nj >= 0 && nj < gameState.width && !gameState.revealedCells[ni][nj] && !gameState.flaggedCells[ni][nj]) {
                    revealCell(ni, nj, cellsToUpdate);
                    cellsToUpdate.push({ row: ni, col: nj });
                }
            }
        }
        const prevSelectedCell = gameState.selectedCell ? { row: gameState.selectedCell.row, col: gameState.selectedCell.col } : null;
        gameState.selectedCell = null;
        if (prevSelectedCell) cellsToUpdate.push(prevSelectedCell);
        renderGrid(cellsToUpdate);
        if (!gameState.gameOver) checkWin();
    }
}

function autoOpenSelected() {
    if (gameState.gameOver || !gameState.selectedCell || gameState.flagMode) return;
    const row = gameState.selectedCell.row;
    const col = gameState.selectedCell.col;
    handleChording(row, col);
}

function openSelectedCell() {
    if (gameState.gameOver || !gameState.selectedCell || gameState.flagMode) return;
    const row = gameState.selectedCell.row;
    const col = gameState.selectedCell.col;
    handleCellClick(row, col);
}

function placeFlagOnSelected() {
    if (gameState.gameOver || !gameState.selectedCell || gameState.flagMode) return;
    const row = gameState.selectedCell.row;
    const col = gameState.selectedCell.col;
    if (!gameState.revealedCells[row][col]) {
        const flagCount = gameState.flaggedCells.flat().filter(f => f).length;
        if (!gameState.flaggedCells[row][col] && flagCount >= gameState.mines) return;
        gameState.flaggedCells[row][col] = !gameState.flaggedCells[row][col];
        const prevSelectedCell = { row, col };
        gameState.selectedCell = null;
        renderGrid([{ row, col }, prevSelectedCell]);
    }
}

function revealCell(row, col, cellsToUpdate, isInitial = false) {
    if (row < 0 || row >= gameState.size || col < 0 || col >= gameState.width || gameState.revealedCells[row][col] || (!isInitial && gameState.flaggedCells[row][col])) return;

    const queue = [{ row, col }];
    while (queue.length > 0) {
        const { row: r, col: c } = queue.shift();
        if (gameState.revealedCells[r][c]) continue;

        gameState.revealedCells[r][c] = true;
        cellsToUpdate.push({ row: r, col: c });

        if (gameState.grid[r][c] === 'mine' && !isInitial) {
            gameState.gameOver = true;
            updateStatus('game-over', '🔥💣 ゲームオーバー！ 💣🔥');
            revealAll(true);
            return;
        }

        if (gameState.grid[r][c] === 0) {
            for (let di = -1; di <= 1; di++) {
                for (let dj = -1; dj <= 1; dj++) {
                    const ni = r + di, nj = c + dj;
                    if (ni >= 0 && ni < gameState.size && nj >= 0 && nj < gameState.width && !gameState.revealedCells[ni][nj]) {
                        queue.push({ row: ni, col: nj });
                    }
                }
            }
        }
    }
}

function revealAll(isGameOver = false) {
    try {
        const cellsToUpdate = [];
        for (let i = 0; i < gameState.size; i++) {
            for (let j = 0; j < gameState.width; j++) {
                if (!gameState.revealedCells[i][j]) {
                    gameState.revealedCells[i][j] = true;
                    cellsToUpdate.push({ row: i, col: j });
                }
                if (isGameOver && gameState.grid[i][j] === 'mine') {
                    const cell = document.querySelector(`.cell[data-row="${i}"][data-col="${j}"]`);
                    if (cell) {
                        cell.classList.remove('flagged', 'opened');
                        cell.classList.add('mine', 'exploded');
                    }
                } else if (!isGameOver && gameState.grid[i][j] !== 'mine' && !gameState.revealedCells[i][j]) {
                    const cell = document.querySelector(`.cell[data-row="${i}"][data-col="${j}"]`);
                    if (cell) cell.classList.add('cleared');
                }
            }
        }
        renderGrid(cellsToUpdate);
        if (isGameOver) {
            setTimeout(() => {
                document.querySelectorAll('.cell.exploded').forEach(cell => {
                    cell.classList.remove('exploded');
                });
            }, 2000);
        }
    } catch (e) {
        console.error('revealAll error:', e);
        updateStatus('error', `エラー: 全マス表示。原因: ${e.message}。ページをリロードしてください。`);
    }
}

function checkWin() {
    try {
        if (gameState.gameOver) return;
        let safeCells = gameState.size * gameState.width - gameState.mines;
        let revealedCount = 0;
        for (let i = 0; i < gameState.size; i++) {
            for (let j = 0; j < gameState.width; j++) {
                if (gameState.revealedCells[i][j] && gameState.grid[i][j] !== 'mine') revealedCount++;
            }
        }
        if (revealedCount >= safeCells) {
            gameState.gameOver = true;
            updateStatus('cleared', '✨🚩 クリア！ 🚩✨');
            revealAll();
        }
    } catch (e) {
        console.error('checkWin error:', e);
        updateStatus('error', `エラー: 勝利判定。原因: ${e.message}。ページをリロードしてください。`);
    }
}

function updateStatus(className = 'normal', message = '') {
    try {
        const status = document.querySelector('#status');
        if (status) {
            const remainingMines = gameState.mines - gameState.flaggedCells.flat().filter(f => f).length;
            status.textContent = className === 'normal' ? 
                (gameState.currentDifficulty ? `地雷: ${remainingMines}` : '難易度を選択してください') : message;
            status.className = '';
            if (className) status.classList.add(className);
        }
    } catch (e) {
        console.error('updateStatus error:', e);
        const status = document.querySelector('#status');
        if (status) {
            status.textContent = `エラー: ステータス更新。原因: ${e.message}。ページをリロードしてください。`;
            status.classList.add('error');
        }
    }
}

function resetGame() {
    console.log('Resetting game');
    try {
        startGame(gameState.currentDifficulty || 'easy');
    } catch (e) {
        console.error('resetGame error:', e);
        updateStatus('error', `エラー: リセット。原因: ${e.message}。ページをリロードしてください。`);
    }
}

function toggleFlagMode() {
    console.log('Toggling flag mode');
    try {
        gameState.flagMode = !gameState.flagMode;
        const flagModeButton = document.querySelector('#flag-mode');
        if (flagModeButton) {
            flagModeButton.textContent = `${gameState.flagMode ? '🚩' : '🔍'} フラグモード: ${gameState.flagMode ? 'ON' : 'OFF'}`;
        }
        const prevSelectedCell = gameState.selectedCell ? { row: gameState.selectedCell.row, col: gameState.selectedCell.col } : null;
        gameState.selectedCell = null;
        const cellsToUpdate = prevSelectedCell ? [prevSelectedCell] : [];
        renderGrid(cellsToUpdate);
    } catch (e) {
        console.error('toggleFlagMode error:', e);
        updateStatus('error', `エラー: フラグ切り替え。原因: ${e.message}。ページをリロードしてください。`);
    }
}

function showHelp() {
    console.log('Showing help');
    try {
        const modal = document.querySelector('#modal');
        const modalContent = document.querySelector('#modal-content');
        if (modal && modalContent) {
            const updatedHelpContent = helpContent.replace(
                '上級で二本指スワイプでスクロール。',
                '一本指ドラッグでスクロール。'
            );
            modalContent.innerHTML = updatedHelpContent;
            modal.style.display = 'flex';
        }
    } catch (e) {
        console.error('showHelp error:', e);
        updateStatus('error', `エラー: ヘルプ表示。原因: ${e.message}。ページをリロードしてください。`);
    }
}

function showHardModeBanner() {
    console.log('Showing hard mode banner');
    try {
        const modal = document.querySelector('#modal');
        const content = document.querySelector('#modal-content');
        if (modal && content) {
            content.innerHTML = `
                <h2>上級モードへようこそ！</h2>
                <p>上級モード（16x30）はグリッドが広いです。画面を一本指でドラッグしてスクロールできます！</p>
                <button onclick="closeHardModeBanner()">閉じる</button>
            `;
            modal.style.display = 'flex';
            sessionStorage.setItem('hardModeBanner', 'true');
        }
    } catch (e) {
        console.error('showHardModeBanner error:', e);
        updateStatus('error', `エラー: ガイド表示。原因: ${e.message}。ページをリロードしてください。`);
    }
}

function closeHardModeBanner() {
    console.log('Closing hard mode banner');
    try {
        const modal = document.querySelector('#modal');
        const modalContent = document.querySelector('#modal-content');
        if (modal && modalContent) {
            modal.style.display = 'none';
            modalContent.innerHTML = helpContent;
        }
    } catch (e) {
        console.error('closeHardModeBanner error:', e);
        updateStatus('error', `エラー: ガイド閉じる。原因: ${e.message}。ページをリロードしてください。`);
    }
}

function closeHelp() {
    console.log('Closing help');
    try {
        const modal = document.querySelector('#modal');
        if (modal) modal.style.display = 'none';
    } catch (e) {
        console.error('closeHelp error:', e);
        updateStatus('error', `エラー: ヘルプ閉じる。原因: ${e.message}。ページをリロードしてください。`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded');
    try {
        bindButtonEvents();
        updateStatus('normal', '難易度を選択してください');
    } catch (e) {
        console.error('DOMContentLoaded error:', e);
        updateStatus('error', `エラー: ページ読み込み。原因: ${e.message}。ページをリロードしてください。`);
    }
});