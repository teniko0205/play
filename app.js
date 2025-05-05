// 初始化 GUN
const gun = Gun({
    peers: ['https://gun-manhattan.herokuapp.com/gun']
});

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

// 開始新回合
function startNewRound() {
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
    return word;
}

// 猜測答案
function makeGuess(answer) {
    if (!currentPlayer || canDraw) return;
    
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

        // 更換畫圖者
        setTimeout(() => {
            players.once((allPlayers) => {
                const playerIds = Object.keys(allPlayers || {});
                const currentIndex = playerIds.indexOf(currentPlayer.id);
                const nextIndex = (currentIndex + 1) % playerIds.length;
                gameState.get('currentDrawer').put(playerIds[nextIndex]);
                if (playerIds[nextIndex] === currentPlayer.id) {
                    currentWord = startNewRound();
                }
            });
        }, 2000);
    } else {
        messages.set({
            playerId: currentPlayer.id,
            playerName: currentPlayer.name,
            text: `猜測: ${answer}`,
            timestamp: Date.now()
        });
    }
}

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
        } else {
            wordDisplay.textContent = '請猜出圖中畫的是什麼';
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

// 加入遊戲
joinButton.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (name) {
        currentPlayer = {
            name: name,
            score: 0,
            id: Math.random().toString(36).substring(2)
        };
        players.get(currentPlayer.id).put(currentPlayer);
        joinButton.disabled = true;
        playerNameInput.disabled = true;

        players.once((data) => {
            if (Object.keys(data || {}).length === 1) {
                gameState.get('currentDrawer').put(currentPlayer.id);
                currentWord = startNewRound();
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