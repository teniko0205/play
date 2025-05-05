// 初始化 GUN
const gun = Gun({
    peers: ['https://gun-manhattan.herokuapp.com/gun']
});

// 遊戲設定
const GAME_CONFIG = {
    MIN_PLAYERS: 3,
    MAX_PLAYERS: 8,
    DRAWING_TIME: 120, // 2分鐘
    GUESSING_TIME: 30, // 30秒
};

// 遊戲狀態
const gameState = gun.get('drawingGame');
const players = gameState.get('players');
const currentDrawing = gameState.get('drawing');
const messages = gameState.get('messages');

// 詞彙分類
const wordCategories = {
    水果: ['蘋果', '香蕉', '橘子', '葡萄', '西瓜', '草莓', '鳳梨', '梨子'],
    動物: ['貓', '狗', '兔子', '老鼠', '大象', '獅子', '長頸鹿', '熊貓'],
    物品: ['書', '電腦', '手機', '眼鏡', '雨傘', '鑰匙', '錢包', '手錶'],
    自然: ['太陽', '月亮', '星星', '雲', '山', '海', '樹', '花']
};

let currentOptions = [];
let correctAnswer = '';

// 新增計時相關變數
let timerInterval = null;
let remainingTime = 0;
let isGuessingPhase = false;

// DOM 元素
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const brushSize = document.getElementById('brushSize');
const clearButton = document.getElementById('clearCanvas');
const playerNameInput = document.getElementById('playerName');
const joinButton = document.getElementById('joinGame');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const messagesDiv = document.getElementById('messages');
const wordDisplay = document.getElementById('wordDisplay');
const playersDiv = document.getElementById('players');
const optionsDiv = document.getElementById('options');
const gameStatusDiv = document.getElementById('gameStatus');
const timerElement = document.getElementById('timer');
const submitButton = document.getElementById('submitDrawing');
const resetButton = document.getElementById('resetGame');

// 設置畫布大小
function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// 畫圖相關變數
let isDrawing = false;
let currentColor = '#000000';
let currentSize = 5;
let canDraw = false;

// 更新計時器顯示
function updateTimer() {
    const minutes = Math.floor(remainingTime / 60);
    const seconds = remainingTime % 60;
    timerElement.textContent = `剩餘時間: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // 更新計時器樣式
    if (remainingTime <= 10) {
        timerElement.className = 'timer danger';
    } else if (remainingTime <= 30) {
        timerElement.className = 'timer warning';
    } else {
        timerElement.className = 'timer';
    }
}

// 開始計時
function startTimer(duration, isGuessing = false) {
    clearInterval(timerInterval);
    remainingTime = duration;
    isGuessingPhase = isGuessing;
    updateTimer();

    return new Promise((resolve) => {
        timerInterval = setInterval(() => {
            remainingTime--;
            updateTimer();

            if (remainingTime <= 0) {
                clearInterval(timerInterval);
                resolve();
            }
        }, 1000);
    });
}

// 處理時間到
async function handleTimeUp() {
    if (isGuessingPhase) {
        // 猜題時間結束
        if (canDraw) {
            // 扣除畫圖者的分數
            const player = players.get(currentPlayer.id);
            player.once((data) => {
                data.score = Math.max(0, (data.score || 0) - 1);
                player.put(data);
            });

            messages.set({
                playerId: 'system',
                playerName: 'System',
                text: '時間到！由於沒有人猜對，畫圖者扣1分',
                timestamp: Date.now()
            });
        }
        
        // 更換畫圖者
        players.once((allPlayers) => {
            const playerIds = Object.keys(allPlayers || {});
            const currentIndex = playerIds.indexOf(currentPlayer.id);
            const nextIndex = (currentIndex + 1) % playerIds.length;
            gameState.get('currentDrawer').put(playerIds[nextIndex]);
            if (playerIds[nextIndex] === currentPlayer.id) {
                startNewRound();
            }
        });
    } else {
        // 作畫時間結束，自動提交
        if (canDraw) {
            submitDrawing();
        }
    }
}

// 提交作畫
async function submitDrawing() {
    if (!canDraw) return;
    
    submitButton.style.display = 'none';
    clearInterval(timerInterval);
    
    // 開始猜題階段
    gameState.get('gamePhase').put('guessing');
    messages.set({
        playerId: 'system',
        playerName: 'System',
        text: '作畫已提交！開始猜題（30秒）',
        timestamp: Date.now()
    });
}

// 監聽提交按鈕
submitButton.addEventListener('click', submitDrawing);

// 重置遊戲函數
function resetGame() {
    // 重新初始化 gun 實例
    gun.get('drawingGame').put(null);
    
    // 等待一小段時間確保數據被清除
    setTimeout(() => {
        // 重新獲取遊戲狀態的引用
        gameState.get('currentDrawer').put(null);
        gameState.get('currentWord').put(null);
        gameState.get('currentOptions').put(null);
        gameState.get('gamePhase').put(null);
        gameState.get('drawing').put(null);
        
        // 遍歷並清除所有玩家
        players.map().once((data, key) => {
            if (data) {
                players.get(key).put(null);
            }
        });
        
        // 遍歷並清除所有訊息
        messages.map().once((data, key) => {
            if (data) {
                messages.get(key).put(null);
            }
        });
        
        // 清除計時器
        clearInterval(timerInterval);
        timerElement.textContent = '剩餘時間: --:--';
        timerElement.className = 'timer';
        
        // 清除畫布
        clearCanvas();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 清除選項
        optionsDiv.innerHTML = '';
        
        // 清除玩家列表顯示
        playersDiv.innerHTML = '';
        
        // 清除訊息顯示
        messagesDiv.innerHTML = '';
        
        // 重置玩家狀態
        if (currentPlayer) {
            currentPlayer = null;
            canDraw = false;
        }
        
        // 重置遊戲階段
        isGuessingPhase = false;
        correctAnswer = '';
        currentOptions = [];
        
        // 重置所有輸入狀態
        joinButton.disabled = false;
        playerNameInput.disabled = false;
        playerNameInput.value = '';
        submitButton.style.display = 'none';
        messageInput.value = '';
        
        // 重置顏色和筆刷大小
        colorPicker.value = '#000000';
        currentColor = '#000000';
        brushSize.value = '5';
        currentSize = 5;
        
        // 清除詞彙顯示
        wordDisplay.textContent = '';
        
        // 更新遊戲狀態顯示
        updateGameStatus(0);
        
        // 添加系統訊息
        setTimeout(() => {
            messages.set({
                playerId: 'system',
                playerName: 'System',
                text: '遊戲已完全重置，請重新整理頁面後加入遊戲',
                timestamp: Date.now()
            });
        }, 500);
        
        // 提示使用者重新整理頁面
        alert('遊戲已重置，請所有玩家重新整理頁面！');
        location.reload();
    }, 1000);
}

// 監聽重置按鈕點擊
resetButton.addEventListener('click', () => {
    const confirmReset = confirm('確定要重置遊戲嗎？這將清除所有遊戲進度。');
    if (confirmReset) {
        resetGame();
    }
});

// 畫圖功能
function draw(e) {
    if (!isDrawing || !canDraw) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineWidth = currentSize;
    ctx.lineCap = 'round';
    ctx.strokeStyle = currentColor;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);

    // 同步繪圖數據
    currentDrawing.set({
        x: x / canvas.width,
        y: y / canvas.height,
        color: currentColor,
        size: currentSize,
        isNewLine: false
    });
}

// 監聽繪圖事件
canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);

    if (canDraw) {
        currentDrawing.set({
            x: x / canvas.width,
            y: y / canvas.height,
            color: currentColor,
            size: currentSize,
            isNewLine: true
        });
    }
});

canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', () => isDrawing = false);
canvas.addEventListener('mouseout', () => isDrawing = false);

// 同步其他玩家的繪圖
currentDrawing.on((data) => {
    if (!data) return;
    const x = data.x * canvas.width;
    const y = data.y * canvas.height;

    if (data.isNewLine) {
        ctx.beginPath();
        ctx.moveTo(x, y);
    } else {
        ctx.lineWidth = data.size;
        ctx.lineCap = 'round';
        ctx.strokeStyle = data.color;
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    }
});

// 清除畫布
function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (canDraw) {
        currentDrawing.set({clear: true});
    }
}

currentDrawing.on((data) => {
    if (data && data.clear) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
});

clearButton.addEventListener('click', clearCanvas);
colorPicker.addEventListener('input', (e) => currentColor = e.target.value);
brushSize.addEventListener('input', (e) => currentSize = e.target.value);

// 產生選項
function generateOptions(correct) {
    const category = Object.entries(wordCategories).find(([_, words]) => 
        words.includes(correct)
    )[0];
    
    const words = wordCategories[category];
    const options = [correct];
    
    while (options.length < 4) {
        const randomWord = words[Math.floor(Math.random() * words.length)];
        if (!options.includes(randomWord)) {
            options.push(randomWord);
        }
    }
    
    // 打亂選項順序
    return options.sort(() => Math.random() - 0.5);
}

// 顯示選項
function displayOptions(options, enabled = true) {
    optionsDiv.innerHTML = '';
    options.forEach((option, index) => {
        const button = document.createElement('button');
        button.className = 'option-button';
        button.textContent = option;
        button.disabled = !enabled;
        
        if (enabled && !canDraw) {
            button.addEventListener('click', () => makeGuess(option));
        }
        
        optionsDiv.appendChild(button);
    });
}

// 更新遊戲狀態顯示
function updateGameStatus(playerCount) {
    if (playerCount >= GAME_CONFIG.MAX_PLAYERS) {
        gameStatusDiv.className = 'game-status full';
        gameStatusDiv.textContent = `遊戲人數已滿（${playerCount}/${GAME_CONFIG.MAX_PLAYERS}）`;
        joinButton.disabled = true;
        playerNameInput.disabled = true;
    } else if (playerCount < GAME_CONFIG.MIN_PLAYERS) {
        gameStatusDiv.className = 'game-status waiting';
        gameStatusDiv.textContent = `等待更多玩家加入（${playerCount}/${GAME_CONFIG.MIN_PLAYERS}）`;
        if (currentPlayer) {
            wordDisplay.textContent = '等待人數達到 3 人以開始遊戲';
        }
    } else {
        gameStatusDiv.className = 'game-status ready';
        gameStatusDiv.textContent = `遊戲進行中（${playerCount}/${GAME_CONFIG.MAX_PLAYERS}）`;
    }
}

// 檢查玩家數量並更新遊戲狀態
function checkPlayersAndUpdateGame(playersData) {
    const playerCount = Object.keys(playersData || {}).length;
    updateGameStatus(playerCount);
    
    // 如果人數不足，停止遊戲
    if (playerCount < GAME_CONFIG.MIN_PLAYERS) {
        gameState.get('currentWord').put(null);
        gameState.get('currentOptions').put(null);
        return false;
    }
    
    return true;
}

// 開始新回合
function startNewRound() {
    players.once(async (data) => {
        if (!checkPlayersAndUpdateGame(data)) {
            return null;
        }
        
        clearCanvas();
        const categories = Object.keys(wordCategories);
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        const words = wordCategories[randomCategory];
        const word = words[Math.floor(Math.random() * words.length)];
        const options = generateOptions(word);
        
        currentOptions = options;
        correctAnswer = word;
        
        gameState.get('currentWord').put(word);
        gameState.get('currentOptions').put(options);
        gameState.get('gamePhase').put('drawing');
        
        return word;
    });
}

// 猜測答案
function makeGuess(answer) {
    if (!currentPlayer || canDraw || !isGuessingPhase) return;
    
    const isCorrect = answer === correctAnswer;
    const buttons = optionsDiv.getElementsByClassName('option-button');
    
    Array.from(buttons).forEach(button => {
        if (button.textContent === answer) {
            button.classList.add(isCorrect ? 'correct' : 'incorrect');
        } else if (button.textContent === correctAnswer && !isCorrect) {
            button.classList.add('correct');
        }
        button.disabled = true;
    });

    if (isCorrect) {
        const player = players.get(currentPlayer.id);
        player.once((data) => {
            data.score = (data.score || 0) + 1;
            player.put(data);
        });

        messages.set({
            playerId: currentPlayer.id,
            playerName: currentPlayer.name,
            text: answer,
            isCorrect: true,
            timestamp: Date.now()
        });

        // 立即結束猜題階段
        clearInterval(timerInterval);
        handleTimeUp();
    } else {
        messages.set({
            playerId: currentPlayer.id,
            playerName: currentPlayer.name,
            text: `猜測: ${answer}`,
            timestamp: Date.now()
        });
    }
}

// 監聽遊戲階段
gameState.get('gamePhase').on(async (phase) => {
    if (!phase || !currentPlayer) return;
    
    if (phase === 'drawing') {
        // 開始作畫階段
        if (canDraw) {
            submitButton.style.display = 'block';
            startTimer(GAME_CONFIG.DRAWING_TIME).then(handleTimeUp);
        }
    } else if (phase === 'guessing') {
        // 開始猜題階段
        startTimer(GAME_CONFIG.GUESSING_TIME, true).then(handleTimeUp);
    }
});

// 監聽遊戲狀態
gameState.get('currentOptions').on((options) => {
    if (!options || !currentPlayer) return;
    currentOptions = options;
    displayOptions(options, !canDraw);
});

// 更新玩家列表
players.map().on((player, id) => {
    if (!player) return;
    let playerElement = document.getElementById(`player-${id}`);
    if (!playerElement) {
        playerElement = document.createElement('div');
        playerElement.id = `player-${id}`;
        playersDiv.appendChild(playerElement);
    }
    playerElement.textContent = `${player.name}: ${player.score || 0}分`;
});

// 監聽玩家列表變化
players.on((data) => {
    if (!data) return;
    checkPlayersAndUpdateGame(data);
});

// 監聽當前畫圖者
gameState.get('currentDrawer').on((drawerId) => {
    if (!drawerId || !currentPlayer) return;
    canDraw = (drawerId === currentPlayer.id);
    
    players.get(drawerId).once((drawer) => {
        if (!drawer) return;
        const message = document.createElement('div');
        message.className = 'message system-message';
        message.textContent = `輪到 ${drawer.name} 畫圖`;
        messagesDiv.appendChild(message);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        if (canDraw) {
            wordDisplay.textContent = `請畫出: ${correctAnswer}`;
            submitButton.style.display = 'block';
        } else {
            wordDisplay.textContent = '請猜出圖中畫的是什麼';
            submitButton.style.display = 'none';
        }
    });
});

// 監聽當前詞彙
gameState.get('currentWord').on((word) => {
    if (!word || !currentPlayer) return;
    correctAnswer = word;
    if (canDraw) {
        wordDisplay.textContent = `請畫出: ${word}`;
    }
});

// 修改加入遊戲的邏輯
joinButton.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (name) {
        players.once((data) => {
            const playerCount = Object.keys(data || {}).length;
            if (playerCount >= GAME_CONFIG.MAX_PLAYERS) {
                alert('遊戲人數已達上限！');
                return;
            }
            
            currentPlayer = {
                name: name,
                score: 0,
                id: Math.random().toString(36).substring(2)
            };
            
            players.get(currentPlayer.id).put(currentPlayer);
            joinButton.disabled = true;
            playerNameInput.disabled = true;

            // 如果是第一個玩家，等待其他玩家加入
            if (playerCount === 0) {
                messages.set({
                    playerId: 'system',
                    playerName: 'System',
                    text: '等待更多玩家加入...',
                    timestamp: Date.now()
                });
            } 
            // 如果達到最小人數且還沒有畫圖者，設置第一個玩家為畫圖者
            else if (playerCount + 1 >= GAME_CONFIG.MIN_PLAYERS) {
                gameState.get('currentDrawer').once((drawerId) => {
                    if (!drawerId) {
                        const firstPlayer = Object.keys(data)[0];
                        gameState.get('currentDrawer').put(firstPlayer);
                        currentWord = startNewRound();
                    }
                });
            }
        });
    }
});

// 發送訊息
sendButton.addEventListener('click', () => {
    const message = messageInput.value.trim();
    if (!message || !currentPlayer) return;
    
    messages.set({
        playerId: currentPlayer.id,
        playerName: currentPlayer.name,
        text: message,
        timestamp: Date.now()
    });
    
    messageInput.value = '';
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const message = messageInput.value.trim();
        if (!message || !currentPlayer) return;
        
        messages.set({
            playerId: currentPlayer.id,
            playerName: currentPlayer.name,
            text: message,
            timestamp: Date.now()
        });
        
        messageInput.value = '';
    }
});

// 顯示訊息
messages.map().on((message) => {
    if (!message) return;
    const messageElement = document.createElement('div');
    messageElement.className = 'message' + (message.isCorrect ? ' correct-guess' : '');
    messageElement.textContent = `${message.playerName}: ${message.text}`;
    
    if (message.isCorrect) {
        messageElement.textContent += ' (猜對了！)';
    }
    
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
});