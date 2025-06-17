const DIFFICULTIES = {
    easy: { size: 9, width: 9, mines: 10 },
    medium: { size: 16, width: 16, mines: 40 },
    hard: { size: 16, width: 30, mines: 99 }
};

const gameState = {
    size: 0, width: 0, mines: 0, flagsPlaced: 0,
    grid: [], revealedCells: [], flaggedCells: [],
    gameOver: false, currentDifficulty: '', flagMode: false,
    selectedCell: null, lastClickTime: 0, lastClickCell: null,
    rafId: null, eventListeners: [], buttonListeners: [],
    isDragging: false, touchStartPos: { x: 0, y: 0 }, initialScroll: { left: 0, top: 0 },
    timer: 0, timerId: null,
    animationTimeoutIds: []
};

const touchThreshold = 400;
const dragThreshold = 10;

const helpContent = `
    <h2>マインスイーパのルール</h2>
    <p>地雷を避けながら全ての安全なマスを開けるロジックパズルです。開始時に安全地帯が自動で開きます。</p>
    <h3>ルール</h3>
    <ul>
        <li>マスをクリック/タップで開きます。</li>
        <li>数字は周囲8マスの地雷の数を表します。</li>
        <li>地雷（💣）を開くとゲームオーバーです。</li>
        <li>フラグモードOFF: タップで選択（赤枠）、アクションボタンで操作。ON: タップ/クリックでフラグを設置/解除。</li>
        <li>全ての安全なマスを開けば勝利です！</li>
    </ul>
    <h3>操作方法</h3>
    <ul>
        <li><b>PC</b>: 左クリックで開く、右クリックでフラグ、ダブルクリックで周囲を開く。</li>
        <li><b>スマホ/タブレット</b>: タップで選択、ダブルタップで周囲を開く、アクションボタンで操作。</li>
        <li><b>スクロール</b>: 一本指ドラッグでスクロール。</li>
    </ul>
    <button onclick="closeHelp()">閉じる</button>
`;

// --- Game Initialization ---

function startGame(difficulty) {
    console.log(`Starting game with difficulty: ${difficulty}`);
    if (!DIFFICULTIES[difficulty]) {
        console.error(`Invalid difficulty: ${difficulty}`);
        return;
    }
    gameState.currentDifficulty = difficulty;
    const config = DIFFICULTIES[difficulty];
    Object.assign(gameState, { size: config.size, width: config.width, mines: config.mines });

    const gridElement = document.querySelector('#grid');
    const rootStyles = getComputedStyle(document.documentElement);
    const cellSize = parseInt(rootStyles.getPropertyValue('--cell-size'), 10);
    gridElement.style.gridTemplateColumns = `repeat(${gameState.width}, ${cellSize}px)`;
    
    initGameGrid();
    
    if (difficulty === 'hard' && !sessionStorage.getItem('hardModeBanner')) {
        setTimeout(showHardModeBanner, 500);
    }
}

function initGameGrid() {
    console.log('Initializing game grid');

    gameState.animationTimeoutIds.forEach(clearTimeout);
    gameState.animationTimeoutIds = [];
    
    stopTimer();
    Object.assign(gameState, {
        timer: 0,
        grid: Array(gameState.size).fill().map(() => Array(gameState.width).fill(0)),
        revealedCells: Array(gameState.size).fill().map(() => Array(gameState.width).fill(false)),
        flaggedCells: Array(gameState.size).fill().map(() => Array(gameState.width).fill(false)),
        gameOver: false,
        flagsPlaced: 0,
        selectedCell: null,
        lastClickTime: 0,
        lastClickCell: null
    });
    
    resetGameUI();
    
    const safeRow = Math.floor(Math.random() * (gameState.size - 2)) + 1;
    const safeCol = Math.floor(Math.random() * (gameState.width - 2)) + 1;
    placeMines(safeRow, safeCol);
    openSafeZone(safeRow, safeCol);

    renderGrid();
    bindEventListeners();
    bindButtonEvents();
    startTimer();
}

// --- Event Binding ---

function bindEventListeners() {
    gameState.eventListeners.forEach(({ element, event, handler }) => element.removeEventListener(event, handler));
    gameState.eventListeners = [];
    const container = document.querySelector('#grid-container');
    if (container) {
        const handlers = {
            touchstart: (e) => handleTouchStart(e),
            touchmove: (e) => handleTouchMove(e),
            touchend: (e) => handleTouchEnd(e)
        };
        Object.entries(handlers).forEach(([event, handler]) => {
            // ★★★ FIX: addEventListenerの引数を正しく設定
            container.addEventListener(event, handler, { passive: event !== 'touchmove' });
            gameState.eventListeners.push({ element: container, event, handler });
        });
    }
}

function bindButtonEvents() {
    gameState.buttonListeners.forEach(([id, handler]) => {
        const button = document.querySelector(`#${id}`);
        if(button) button.removeEventListener('click', handler);
    });
    gameState.buttonListeners = [];

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
            button.addEventListener('click', handler);
            gameState.buttonListeners.push([id, handler]);
        }
    });
}

// --- Game Logic ---

function placeMines(safeRow, safeCol) {
    let minesPlaced = 0;
    const candidates = [];
    for (let i = 0; i < gameState.size; i++) {
        for (let j = 0; j < gameState.width; j++) {
            if (Math.abs(i - safeRow) > 1 || Math.abs(j - safeCol) > 1) {
                candidates.push([i, j]);
            }
        }
    }
    if (candidates.length < gameState.mines) throw new Error(`Not enough cells for mines`);

    while (minesPlaced < gameState.mines && candidates.length > 0) {
        const index = Math.floor(Math.random() * candidates.length);
        const [r, c] = candidates.splice(index, 1)[0];
        gameState.grid[r][c] = 'mine';
        minesPlaced++;
    }

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
            const ni = row + di;
            const nj = col + dj;
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
            const ni = row + di;
            const nj = col + dj;
            if (ni >= 0 && ni < gameState.size && nj >= 0 && nj < gameState.width && gameState.flaggedCells[ni][nj]) {
                count++;
            }
        }
    }
    return count;
}

function openSafeZone(row, col) {
    const cellsToUpdate = [];
    for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
            const ni = row + di;
            const nj = col + dj;
            if (ni >= 0 && ni < gameState.size && nj >= 0 && nj < gameState.width) {
                revealCell(ni, nj, cellsToUpdate, true);
            }
        }
    }
    renderGrid(cellsToUpdate);
}

// --- Player Actions ---

function handleCellClick(row, col) {
    if (gameState.gameOver || gameState.flagMode || gameState.flaggedCells[row][col] || gameState.revealedCells[row][col]) {
        return;
    }
    const prevSelected = gameState.selectedCell;
    const cellsToUpdate = [];
    revealCell(row, col, cellsToUpdate);
    gameState.selectedCell = null;
    if (prevSelected) {
        cellsToUpdate.push(prevSelected);
    }
    renderGrid(cellsToUpdate);
    if (!gameState.gameOver) {
        checkWin();
    }
}

function handleClick(e) {
    if (gameState.gameOver) return;
    const row = parseInt(e.target.dataset.row, 10);
    const col = parseInt(e.target.dataset.col, 10);
    if (isNaN(row) || isNaN(col)) return;

    if (gameState.flagMode) {
        if (!gameState.revealedCells[row][col]) {
            if (!gameState.flaggedCells[row][col]) {
                if (gameState.flagsPlaced >= gameState.mines) return;
                gameState.flagsPlaced++;
            } else {
                gameState.flagsPlaced--;
            }
            gameState.flaggedCells[row][col] = !gameState.flaggedCells[row][col];
            gameState.selectedCell = null;
            renderGrid([{ row, col }]);
        }
    } else {
        const currentTime = Date.now();
        if (gameState.lastClickCell?.row === row && gameState.lastClickCell?.col === col && currentTime - gameState.lastClickTime < touchThreshold) {
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
    if (isNaN(row) || isNaN(col)) return;

    if (!gameState.revealedCells[row][col]) {
        if (!gameState.flaggedCells[row][col]) {
            if (gameState.flagsPlaced >= gameState.mines) return;
            gameState.flagsPlaced++;
        } else {
            gameState.flagsPlaced--;
        }
        gameState.flaggedCells[row][col] = !gameState.flaggedCells[row][col];
        gameState.selectedCell = null;
        renderGrid([{ row, col }]);
    }
}

function handleChording(row, col) {
    if (gameState.gameOver || !gameState.revealedCells[row][col] || gameState.grid[row][col] <= 0) {
        return;
    }
    if (countFlags(row, col) === gameState.grid[row][col]) {
        const cellsToUpdate = [];
        for (let di = -1; di <= 1; di++) {
            for (let dj = -1; dj <= 1; dj++) {
                const ni = row + di;
                const nj = col + dj;
                if (ni >= 0 && ni < gameState.size && nj >= 0 && nj < gameState.width && !gameState.revealedCells[ni][nj] && !gameState.flaggedCells[ni][nj]) {
                    revealCell(ni, nj, cellsToUpdate);
                }
            }
        }
        const prevSelected = gameState.selectedCell;
        gameState.selectedCell = null;
        if (prevSelected) {
            cellsToUpdate.push(prevSelected);
        }
        renderGrid(cellsToUpdate);
        if (!gameState.gameOver) {
            checkWin();
        }
    }
}

function autoOpenSelected() {
    if (gameState.gameOver || !gameState.selectedCell || gameState.flagMode) return;
    handleChording(gameState.selectedCell.row, gameState.selectedCell.col);
}

function openSelectedCell() {
    if (gameState.gameOver || !gameState.selectedCell || gameState.flagMode) return;
    handleCellClick(gameState.selectedCell.row, gameState.selectedCell.col);
}

function placeFlagOnSelected() {
    if (gameState.gameOver || !gameState.selectedCell || gameState.flagMode) return;
    const { row, col } = gameState.selectedCell;
    if (!gameState.revealedCells[row][col]) {
        if (!gameState.flaggedCells[row][col]) {
            if (gameState.flagsPlaced >= gameState.mines) return;
            gameState.flagsPlaced++;
        } else {
            gameState.flagsPlaced--;
        }
        gameState.flaggedCells[row][col] = !gameState.flaggedCells[row][col];
        const prevSelected = { row, col };
        gameState.selectedCell = null;
        renderGrid([prevSelected]);
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
                container.scrollLeft = Math.max(0, gameState.initialScroll.left - dx);
                container.scrollTop = gameState.initialScroll.top - dy;
            }
        });
    }
}

function handleTouchEnd(e) {
    if (gameState.rafId) cancelAnimationFrame(gameState.rafId);
    
    if (!gameState.isDragging) {
        const target = document.elementFromPoint(gameState.touchStartPos.x, gameState.touchStartPos.y);
        if (!target || !target.classList.contains('cell')) return;
        
        const row = parseInt(target.dataset.row, 10);
        const col = parseInt(target.dataset.col, 10);
        if (isNaN(row) || isNaN(col)) return;

        if (gameState.flagMode) {
            if (!gameState.revealedCells[row][col]) {
                if (!gameState.flaggedCells[row][col]) {
                    if (gameState.flagsPlaced >= gameState.mines) return;
                    gameState.flagsPlaced++;
                } else {
                    gameState.flagsPlaced--;
                }
                gameState.flaggedCells[row][col] = !gameState.flaggedCells[row][col];
                renderGrid([{ row, col }]);
            }
        } else {
            const prevSelected = gameState.selectedCell ? { ...gameState.selectedCell } : null;
            const currentTime = Date.now();
            if (gameState.selectedCell?.row === row && gameState.selectedCell?.col === col) {
                if (currentTime - gameState.lastClickTime < touchThreshold) {
                    handleChording(row, col);
                } else {
                    openSelectedCell();
                }
            } else {
                gameState.selectedCell = { row, col };
                const cellsToUpdate = [{ row, col }];
                if (prevSelected) cellsToUpdate.push(prevSelected);
                renderGrid(cellsToUpdate);
            }
            gameState.lastClickTime = currentTime;
        }
    }
    gameState.isDragging = false;
}

// --- Game State & Win/Loss ---

function revealCell(row, col, cellsToUpdate, isInitial = false) {
    const queue = [{ row, col }];
    while (queue.length > 0) {
        const { row: r, col: c } = queue.shift();
        if (r < 0 || r >= gameState.size || c < 0 || c >= gameState.width || gameState.revealedCells[r][c] || (!isInitial && gameState.flaggedCells[r][c])) {
            continue;
        }
        
        gameState.revealedCells[r][c] = true;
        cellsToUpdate.push({ row: r, col: c });
        
        if (gameState.grid[r][c] === 'mine' && !isInitial) {
            endGame(false, r, c);
            return;
        }
        
        if (gameState.grid[r][c] === 0) {
            for (let di = -1; di <= 1; di++) {
                for (let dj = -1; dj <= 1; dj++) {
                    queue.push({ row: r + di, col: c + dj });
                }
            }
        }
    }
}

function checkWin() {
    if (gameState.gameOver) return;
    const safeCells = gameState.size * gameState.width - gameState.mines;
    let revealedCount = 0;
    for (let i = 0; i < gameState.size; i++) {
        for (let j = 0; j < gameState.width; j++) {
            if (gameState.revealedCells[i][j] && gameState.grid[i][j] !== 'mine') {
                revealedCount++;
            }
        }
    }
    if (revealedCount >= safeCells) {
        endGame(true);
    }
}

function endGame(isWin, clickedRow, clickedCol) {
    gameState.gameOver = true;
    stopTimer();
    updateStatus(isWin ? '😎' : '😵');
    
    if (isWin) {
        flagAllMines();
    } else {
        revealAllMines(clickedRow, clickedCol);
    }
    showResultModal(isWin);
}

// --- UI & Rendering ---

function renderGrid(cellsToUpdate = null) {
    const gridElement = document.querySelector('#grid');
    if (!gridElement || !gameState.grid || !gameState.grid[0]) return;

    if (!cellsToUpdate) {
        gridElement.innerHTML = '';
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
            if (cell) updateCellDisplay(cell, row, col);
        });
    }
    updateButtonStates();
    updateDisplay();
}

function updateCellDisplay(cell, row, col) {
    cell.className = 'cell';
    cell.textContent = '';
    
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
    
    if (gameState.selectedCell?.row === row && gameState.selectedCell?.col === col && !gameState.flagMode) {
        cell.classList.add('selected');
    }
}

function updateButtonStates() {
    const openBtn = document.querySelector('#open-cell-button');
    const flagBtn = document.querySelector('#flag-button');
    const autoBtn = document.querySelector('#auto-open-button');
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (openBtn) openBtn.disabled = !gameState.selectedCell || gameState.flagMode || gameState.gameOver || !isTouch;
    if (flagBtn) flagBtn.disabled = !gameState.selectedCell || gameState.flagMode || gameState.gameOver || !isTouch;
    if (autoBtn) autoBtn.disabled = !gameState.selectedCell || gameState.flagMode || gameState.gameOver || !isTouch || !isChordingPossible();
}

function isChordingPossible() {
    if (!gameState.selectedCell || !gameState.revealedCells[gameState.selectedCell.row][gameState.selectedCell.col]) {
        return false;
    }
    const { row, col } = gameState.selectedCell;
    const value = gameState.grid[row][col];
    if (typeof value !== 'number' || value <= 0) {
        return false;
    }
    return countFlags(row, col) === value;
}

function updateStatus(smiley = '🙂') {
    const resetButton = document.querySelector('#reset-button');
    if (resetButton) resetButton.textContent = smiley;
}

function updateDisplay() {
    const mineCounter = document.querySelector('#mine-counter');
    const timerDisplay = document.querySelector('#timer');
    
    if (mineCounter) {
        const remaining = gameState.mines - gameState.flagsPlaced;
        mineCounter.textContent = String(Math.max(0, remaining)).padStart(3, '0');
    }
    if (timerDisplay) {
        timerDisplay.textContent = String(gameState.timer).padStart(3, '0');
    }
}

function startTimer() {
    stopTimer();
    gameState.timerId = setInterval(() => {
        if (!gameState.gameOver) {
            gameState.timer++;
            updateDisplay();
        }
    }, 1000);
}

function stopTimer() {
    if (gameState.timerId) {
        clearInterval(gameState.timerId);
        gameState.timerId = null;
    }
}

// --- Game/UI Reset ---

function resetGame() {
    if (gameState.currentDifficulty) {
        startGame(gameState.currentDifficulty);
    }
}

function resetGameUI() {
    document.querySelector('#grid')?.classList.remove('sparkle-animation');
    const resultModal = document.querySelector('#result-modal');
    if (resultModal) resultModal.style.display = 'none';
    const helpModal = document.querySelector('#help-modal');
    if(helpModal) helpModal.style.display = 'none';

    updateStatus('🙂');
    updateDisplay();
}

function retryGame() {
    const resultModal = document.querySelector('#result-modal');
    if (resultModal) resultModal.style.display = 'none';
    resetGame();
}

// --- Animations & Modals ---

function revealAllMines(clickedRow, clickedCol) {
    const mineCells = [];
    for (let i = 0; i < gameState.size; i++) {
        for (let j = 0; j < gameState.width; j++) {
            if (gameState.grid[i][j] !== 'mine' && gameState.flaggedCells[i][j]) {
                const cell = document.querySelector(`.cell[data-row="${i}"][data-col="${j}"]`);
                if (cell) cell.innerHTML = '❌';
            }
            if (gameState.grid[i][j] === 'mine' && !gameState.flaggedCells[i][j]) {
                mineCells.push({ i, j });
            }
        }
    }
    
    const clickedMineCell = document.querySelector(`.cell[data-row="${clickedRow}"][data-col="${clickedCol}"]`);
    if (clickedMineCell) {
        clickedMineCell.classList.add('mine', 'exploded');
    }
    
    mineCells.forEach((mine, index) => {
        const timeoutId = setTimeout(() => {
            const cell = document.querySelector(`.cell[data-row="${mine.i}"][data-col="${mine.j}"]`);
            if (cell) cell.classList.add('mine', 'mine-reveal-animation');
        }, 100 + index * 50);
        gameState.animationTimeoutIds.push(timeoutId);
    });
}

function flagAllMines() {
    const cellsToUpdate = [];
    for (let i = 0; i < gameState.size; i++) {
        for (let j = 0; j < gameState.width; j++) {
            if (gameState.grid[i][j] === 'mine' && !gameState.flaggedCells[i][j]) {
                gameState.flaggedCells[i][j] = true;
                gameState.flagsPlaced++;
                cellsToUpdate.push({ row: i, col: j });
            }
        }
    }
    renderGrid(cellsToUpdate);
    document.querySelector('#grid').classList.add('sparkle-animation');
}

function showResultModal(isWin) {
    const modal = document.querySelector('#result-modal');
    const content = document.querySelector('#result-modal-content');
    if (!modal || !content) return;
    
    const emoji = isWin ? '✨🏆✨' : '💥💣💥';
    const title = isWin ? 'クリア！' : 'ゲームオーバー';
    const message = isWin ? `おめでとうございます！<br>タイム: ${gameState.timer}秒` : '地雷を踏んでしまいました...';
    
    content.innerHTML = `
        <div class="result-emoji">${emoji}</div>
        <h2>${title}</h2>
        <p>${message}</p>
        <button onclick="retryGame()">もう一度挑戦</button>
    `;
    
    const timeoutId = setTimeout(() => {
        modal.style.display = 'flex';
    }, 1500);
    gameState.animationTimeoutIds.push(timeoutId);
}

function toggleFlagMode() {
    gameState.flagMode = !gameState.flagMode;
    const btn = document.querySelector('#flag-mode');
    if (btn) {
        btn.textContent = `${gameState.flagMode ? '🚩' : '🔍'} フラグモード: ${gameState.flagMode ? 'ON' : 'OFF'}`;
    }
    if (gameState.selectedCell) {
        const prevSelected = { ...gameState.selectedCell };
        gameState.selectedCell = null;
        renderGrid([prevSelected]);
    }
    updateButtonStates();
}

function showHelp() {
    const modal = document.querySelector('#help-modal');
    const content = document.querySelector('#help-modal-content');
    if (modal && content) {
        content.innerHTML = helpContent;
        modal.style.display = 'flex';
    }
}

function closeHelp() {
    const modal = document.querySelector('#help-modal');
    if (modal) modal.style.display = 'none';
}

function showHardModeBanner() {
    const modal = document.querySelector('#help-modal');
    const content = document.querySelector('#help-modal-content');
    if (modal && content) {
        content.innerHTML = `
            <h2>上級モードへようこそ！</h2>
            <p>グリッドが広いため、一本指でドラッグしてスクロールできます！</p>
            <button onclick="closeHelp()">閉じる</button>
        `;
        modal.style.display = 'flex';
        sessionStorage.setItem('hardModeBanner', 'true');
    }
}

// --- Initial Load ---

document.addEventListener('DOMContentLoaded', () => {
    bindButtonEvents();
    updateDisplay();
    updateStatus('🙂');
    const helpModalContent = document.querySelector('#help-modal-content');
    if (helpModalContent) {
        helpModalContent.innerHTML = helpContent;
    }
});