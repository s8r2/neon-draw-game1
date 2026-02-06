/**
 * Main Game Controller
 * Handles Socket.IO communication and game state management
 */

class Game {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.socket = null;
        this.roomId = null;
        this.playerId = null;
        this.username = null;
        this.isDrawer = false;
        this.gameState = 'waiting';
        this.currentWord = '';
        this.wordHint = '';
        this.players = [];
        this.scores = {};
        this.round = 1;
        this.maxRounds = 3;
        this.timerInterval = null;
        this.remainingTime = 80;
        this.canvas = null;
    }

        /**
     * Get network info for sharing
     */
    async getNetworkInfo() {
        try {
            const response = await fetch('/network-info');
            const data = await response.json();
            
            if (data.success) {
                let shareUrl = data.local_url;
                let type = 'local';
                
                // Try public IP if available
                if (data.public_url && this.testConnection(data.public_url)) {
                    shareUrl = data.public_url;
                    type = 'public';
                    this.showNotification('Public link ready! Share with anyone.', 'success');
                } else {
                    this.showNotification('Network link ready! Friends must be on same WiFi.', 'warning');
                }
                
                this.showShareModal(shareUrl, type);
            }
        } catch (error) {
            console.error('Error getting network info:', error);
            this.showNotification('Failed to get network link', 'error');
        }
    }
    
    /**
     * Test connection to URL
     */
    async testConnection(url) {
        try {
            const response = await fetch(url, { mode: 'no-cors', method: 'HEAD' });
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * Show share modal
     */
    showShareModal(url, type = 'local') {
        const modal = `
            <div class="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
                <div class="bg-gray-800 rounded-2xl p-6 max-w-md w-full mx-4 border border-cyan-500/30">
                    <h3 class="text-2xl font-bold mb-4 ${type === 'public' ? 'text-green-400' : 'text-yellow-400'}">
                        <i class="fas ${type === 'public' ? 'fa-globe' : 'fa-wifi'} mr-2"></i>
                        ${type === 'public' ? 'Public Game Link' : 'Network Game Link'}
                    </h3>
                    
                    <p class="text-gray-300 mb-4">
                        ${type === 'public' 
                            ? 'Share this link with <span class="text-green-400 font-bold">anyone in the world</span>:' 
                            : 'Share this link with <span class="text-yellow-400 font-bold">friends on same WiFi</span>:'}
                    </p>
                    
                    <div class="flex items-center space-x-2 mb-6">
                        <input type="text" readonly value="${url}" 
                               class="flex-grow p-3 bg-gray-900 rounded-lg border border-gray-700 text-sm font-mono">
                        <button onclick="copyToClipboard('${url}')" 
                                class="px-4 py-3 bg-cyan-600 rounded-lg hover:bg-cyan-700 transition">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    
                    <div class="bg-gray-900/50 rounded-lg p-4 mb-6">
                        <h4 class="font-bold mb-2 text-cyan-300">
                            <i class="fas fa-info-circle mr-2"></i>How to Share
                        </h4>
                        <ul class="text-sm text-gray-300 space-y-1">
                            <li><i class="fas fa-check text-green-400 mr-2"></i>Copy link and send to friends</li>
                            <li><i class="fas fa-check text-green-400 mr-2"></i>Works on mobile/tablet/computer</li>
                            ${type === 'local' 
                                ? '<li><i class="fas fa-exclamation-triangle text-yellow-400 mr-2"></i>Friends must be on same WiFi</li>'
                                : '<li><i class="fas fa-check text-green-400 mr-2"></i>Works from anywhere in the world</li>'}
                        </ul>
                    </div>
                    
                    <div class="flex justify-end">
                        <button onclick="closeModal()" 
                                class="px-6 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal
        const existing = document.getElementById('share-modal');
        if (existing) existing.remove();
        
        // Add new modal
        const div = document.createElement('div');
        div.id = 'share-modal';
        div.innerHTML = modal;
        document.body.appendChild(div);
    }
    /**
 * Get public URL for sharing
 */
async getPublicUrl() {
    try {
        this.showNotification('Getting public link...', 'info');
        
        const response = await fetch('/get-public-url');
        const data = await response.json();
        
        if (data.success && data.url) {
            this.showPublicLinkModal(data.url);
        } else {
            // Fallback to local IP
            this.getLocalIpForSharing();
        }
    } catch (error) {
        console.error('Error getting public URL:', error);
        this.showNotification('Using local network link', 'warning');
        this.getLocalIpForSharing();
    }
}

/**
 * Show public link modal
 */
showPublicLinkModal(publicUrl) {
    const modal = document.getElementById('public-link-modal');
    const input = document.getElementById('public-url-input');
    const copyBtn = document.getElementById('copy-public-link');
    const closeBtn = document.getElementById('close-public-link');
    
    // Set URL
    input.value = publicUrl;
    
    // Generate QR code
    this.generateQRCode(publicUrl);
    
    // Show modal
    modal.classList.remove('hidden');
    
    // Copy button
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(publicUrl).then(() => {
            this.showNotification('Public link copied!', 'success');
        });
    };
    
    // Close button
    closeBtn.onclick = () => {
        modal.classList.add('hidden');
    };
    
    // Close on background click
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    };
}

/**
 * Generate QR code for sharing
 */
generateQRCode(url) {
    const container = document.getElementById('qrcode-container');
    container.innerHTML = '';
    
    // Simple QR code using Unicode blocks
    const qrText = `📱 Scan with phone camera:\n${url}`;
    
    // For better QR, you can use a library:
    // QRCode.toCanvas(container, url, { width: 200 });
    
    container.innerHTML = `
        <div class="text-center p-4 bg-gray-800 rounded-lg">
            <div class="text-cyan-400 mb-2">
                <i class="fas fa-qrcode text-4xl"></i>
            </div>
            <div class="text-sm">${url}</div>
            <div class="text-xs text-gray-400 mt-2">Open camera and point at URL</div>
        </div>
    `;
}

/**
 * Get local IP for sharing
 */
async getLocalIpForSharing() {
    try {
        // Try to get local IP
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        
        const localIp = data.ip || 'localhost';
        const localUrl = `http://${localIp}:5000`;
        
        this.showPublicLinkModal(localUrl);
        
        this.showNotification('Using local IP. Friends must be on same WiFi.', 'warning');
    } catch (error) {
        // Fallback to manual instructions
        this.showNotification('Please share your computer\'s IP address manually', 'error');
    }
}
    /**
     * Initialize the game
     */
    init() {
        this.bindEvents();
        this.initSocket();
    }

    /**
     * Initialize Socket.IO connection
     */
    initSocket() {
        this.socket = io(this.serverUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        this.bindSocketEvents();
    }

    /**
     * Bind Socket.IO events
     */
    bindSocketEvents() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus(true);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus(false);
        });

        this.socket.on('connected', (data) => {
            console.log('Server connected:', data);
        });

        this.socket.on('room_update', (data) => {
            this.handleRoomUpdate(data);
        });

        this.socket.on('game_started', (data) => {
            this.handleGameStarted(data);
        });

        this.socket.on('draw_update', (data) => {
            if (this.canvas && !this.isDrawer) {
                this.canvas.drawFromData(data);
            }
        });

        this.socket.on('canvas_cleared', () => {
            if (this.canvas && !this.isDrawer) {
                this.canvas.clear();
            }
        });

        this.socket.on('chat_message', (data) => {
            this.addChatMessage(data);
        });

        this.socket.on('error', (error) => {
            this.showNotification(error.message || 'An error occurred', 'error');
        });
    }

    /**
     * Bind DOM events
     */
    bindEvents() {
        // Lobby buttons
        document.getElementById('create-room-btn').addEventListener('click', () => this.createRoom());
        document.getElementById('join-room-btn').addEventListener('click', () => this.joinRoom());
        
        // Game buttons
        document.getElementById('start-game-btn').addEventListener('click', () => this.startGame());
        document.getElementById('leave-room-btn').addEventListener('click', () => this.leaveRoom());
        document.getElementById('copy-room-link').addEventListener('click', () => this.copyRoomLink());
        document.getElementById('clear-canvas-btn').addEventListener('click', () => this.clearCanvas());
        document.getElementById('send-chat-btn').addEventListener('click', () => this.sendChatMessage());
        
        // Chat input enter key
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
            
        });
    

        
        
        // Game over buttons
        document.getElementById('play-again-btn').addEventListener('click', () => this.playAgain());
        document.getElementById('back-to-lobby-btn').addEventListener('click', () => this.backToLobby());
        
        // Chat filters
        document.querySelectorAll('.chat-filter').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.filterChat(e.target.dataset.filter);
            });
        });
        
        // Sound toggle
        document.getElementById('sound-toggle').addEventListener('click', () => {
            this.toggleSound();
        });
    }

    /**
     * Create a new game room
     */
    async createRoom() {
        const username = document.getElementById('username-create').value.trim() || 'Player';
        const maxPlayers = document.getElementById('max-players').value;
        
        if (!username) {
            this.showNotification('Please enter a username', 'warning');
            return;
        }
        
        try {
            const response = await fetch('/create-room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    max_players: parseInt(maxPlayers)
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.roomId = data.room_id;
                this.playerId = data.player_id;
                this.username = data.username;
                
                this.showGameScreen();
                this.joinSocketRoom();
                this.showNotification(`Room created! Code: ${this.roomId}`, 'success');
            } else {
                this.showNotification(data.message || 'Failed to create room', 'error');
            }
        } catch (error) {
            console.error('Error creating room:', error);
            this.showNotification('Failed to create room', 'error');
        }
    }

    /**
     * Join an existing room
     */
    async joinRoom() {
        const username = document.getElementById('username-join').value.trim() || 'Player';
        const roomCode = document.getElementById('room-code').value.trim().toUpperCase();
        
        if (!username) {
            this.showNotification('Please enter a username', 'warning');
            return;
        }
        
        if (!roomCode || roomCode.length !== 6) {
            this.showNotification('Please enter a valid 6-character room code', 'warning');
            return;
        }
        
        try {
            const response = await fetch('/join-room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    room_id: roomCode,
                    username: username
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.roomId = data.room_id;
                this.playerId = data.player_id;
                this.username = data.username;
                
                this.showGameScreen();
                this.joinSocketRoom();
                this.showNotification(`Joined room ${this.roomId}!`, 'success');
            } else {
                this.showNotification(data.message || 'Failed to join room', 'error');
            }
        } catch (error) {
            console.error('Error joining room:', error);
            this.showNotification('Failed to join room', 'error');
        }
    }

    /**
     * Join room via Socket.IO
     */
    joinSocketRoom() {
        if (this.socket && this.roomId && this.playerId) {
            this.socket.emit('join', {
                room_id: this.roomId,
                player_id: this.playerId
            });
        }
    }

    /**
     * Start the game
     */
    startGame() {
        if (this.socket && this.roomId) {
            this.socket.emit('start_game', {
                room_id: this.roomId
            });
        }
    }

    /**
     * Leave the current room
     */
    leaveRoom() {
        if (confirm('Are you sure you want to leave the room?')) {
            if (this.socket && this.roomId && this.playerId) {
                this.socket.emit('leave', {
                    room_id: this.roomId,
                    player_id: this.playerId
                });
                
                this.cleanupGame();
                this.showLobbyScreen();
                this.showNotification('Left the room', 'info');
            }
        }
    }

    /**
     * Send chat message
     */
    sendChatMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (message && this.socket && this.roomId && this.playerId) {
            this.socket.emit('chat_message', {
                room_id: this.roomId,
                player_id: this.playerId,
                message: message
            });
            
            input.value = '';
            input.focus();
        }
    }

    /**
     * Clear canvas
     */
    clearCanvas() {
        if (this.isDrawer && this.socket && this.roomId) {
            this.socket.emit('clear_canvas', {
                room_id: this.roomId
            });
            
            if (this.canvas) {
                this.canvas.clear();
            }
        }
    }

    /**
     * Copy room link to clipboard
     */
    copyRoomLink() {
        const roomLink = `${window.location.origin}/room/${this.roomId}`;
        
        navigator.clipboard.writeText(roomLink).then(() => {
            this.showNotification('Room link copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            this.showNotification('Failed to copy link', 'error');
        });
    }

    /**
     * Handle room update from server
     */
    handleRoomUpdate(data) {
        this.gameState = data.game_state;
        this.players = data.players;
        this.scores = data.scores;
        this.round = data.round;
        this.remainingTime = data.remaining_time;
        
        // Update UI
        this.updateRoomInfo(data);
        this.updatePlayersList();
        this.updateLeaderboard();
        
        // Update game state
        this.updateGameState();
    }

    /**
     * Handle game start
     */
    handleGameStarted(data) {
        this.gameState = data.game_state;
        this.isDrawer = data.drawer === this.username;
        this.wordHint = data.word_hint;
        
        // Update UI
        document.getElementById('drawer-info').textContent = 
            this.isDrawer ? 'You are drawing!' : `${data.drawer} is drawing`;
        
        document.getElementById('word-hint').textContent = this.wordHint;
        document.getElementById('word-hint').setAttribute('dir', 'rtl');
        
        // Initialize canvas if not already done
        if (!this.canvas) {
            this.initCanvas();
        }
        
        // Set canvas mode
        if (this.canvas) {
            this.canvas.setDrawMode(this.isDrawer);
        }
        
        // Start timer
        this.startTimer(data.round_time);
        
        this.showNotification('Game started!', 'success');
    }

    /**
     * Initialize canvas
     */
    initCanvas() {
        const canvasElement = document.getElementById('drawing-canvas');
        if (canvasElement) {
            this.canvas = new DrawingCanvas(canvasElement, this);
        }
    }

    /**
     * Start game timer
     */
    startTimer(duration) {
        this.stopTimer();
        
        this.remainingTime = duration;
        this.updateTimerDisplay();
        
        this.timerInterval = setInterval(() => {
            this.remainingTime--;
            this.updateTimerDisplay();
            
            if (this.remainingTime <= 0) {
                this.stopTimer();
                this.showNotification('Time\'s up!', 'warning');
            }
            
            // Blink timer when time is running out
            if (this.remainingTime <= 10) {
                document.getElementById('timer').classList.add('timer-pulse');
            }
        }, 1000);
    }

    /**
     * Stop game timer
     */
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        document.getElementById('timer').classList.remove('timer-pulse');
    }

    /**
     * Update timer display
     */
    updateTimerDisplay() {
        const timerElement = document.getElementById('timer');
        if (timerElement) {
            timerElement.textContent = `${this.remainingTime}s`;
            
            // Change color based on time
            if (this.remainingTime <= 10) {
                timerElement.classList.remove('text-purple-400');
                timerElement.classList.add('text-red-400');
            } else if (this.remainingTime <= 30) {
                timerElement.classList.remove('text-purple-400');
                timerElement.classList.add('text-yellow-400');
            } else {
                timerElement.classList.remove('text-red-400', 'text-yellow-400');
                timerElement.classList.add('text-purple-400');
            }
        }
    }

    /**
     * Update room information display
     */
    updateRoomInfo(data) {
        document.getElementById('room-id-display').innerHTML = 
            `Room: <span class="text-cyan-400">${data.room_id}</span>`;
        
        document.getElementById('game-state').textContent = 
            this.getGameStateText(data.game_state);
        
        document.getElementById('round-counter').textContent = 
            `${data.round}/${data.max_rounds}`;
        
        document.getElementById('player-count').textContent = 
            data.players.length;
    }

    /**
     * Update players list
     */
    updatePlayersList() {
        const container = document.getElementById('players-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.players.forEach(player => {
            const isCurrentPlayer = player.id === this.playerId;
            const isDrawer = this.gameState === 'drawing' && 
                           this.players.find(p => p.username === document.getElementById('drawer-info')?.textContent?.replace('You are drawing!', this.username))?.id === player.id;
            
            const playerElement = document.createElement('div');
            playerElement.className = `player-avatar flex flex-col items-center ${isCurrentPlayer ? 'ring-2 ring-cyan-400' : ''} ${isDrawer ? 'drawer' : ''}`;
            playerElement.style.backgroundColor = player.avatar_color;
            
            playerElement.innerHTML = `
                <div class="text-lg font-bold">${player.username.charAt(0).toUpperCase()}</div>
                <div class="text-xs mt-1">${player.username}</div>
                ${isCurrentPlayer ? '<div class="text-xs text-cyan-300 mt-1">You</div>' : ''}
                ${isDrawer ? '<div class="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-xs">🎨</div>' : ''}
                <div class="text-xs font-bold mt-1">${this.scores[player.id] || 0} pts</div>
            `;
            
            container.appendChild(playerElement);
        });
    }

    /**
     * Update leaderboard
     */
    updateLeaderboard() {
        const container = document.getElementById('leaderboard');
        if (!container) return;
        
        const sortedPlayers = Object.entries(this.scores)
            .sort((a, b) => b[1] - a[1])
            .map(([playerId, score]) => {
                const player = this.players.find(p => p.id === playerId);
                return { ...player, score };
            });
        
        container.innerHTML = '';
        
        if (sortedPlayers.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-trophy text-3xl mb-2"></i>
                    <p>Game not started</p>
                </div>
            `;
            return;
        }
        
        sortedPlayers.forEach((player, index) => {
            const rank = index + 1;
            const isCurrentPlayer = player.id === this.playerId;
            
            const entry = document.createElement('div');
            entry.className = `leaderboard-entry ${isCurrentPlayer ? 'ring-1 ring-cyan-400' : ''}`;
            
            entry.innerHTML = `
                <div class="rank ${rank <= 3 ? 'text-yellow-400' : 'text-gray-400'}">
                    ${rank}
                </div>
                <div class="player-info">
                    <div class="w-8 h-8 rounded-full mr-3 flex-shrink-0" style="background-color: ${player.avatar_color}"></div>
                    <div class="flex-grow">
                        <div class="font-bold ${isCurrentPlayer ? 'text-cyan-300' : ''}">
                            ${player.username} ${isCurrentPlayer ? '(You)' : ''}
                        </div>
                        <div class="text-xs text-gray-400">Player</div>
                    </div>
                </div>
                <div class="score">
                    ${player.score}
                </div>
            `;
            
            container.appendChild(entry);
        });
    }

    /**
     * Update game state UI
     */
    updateGameState() {
        const startBtn = document.getElementById('start-game-btn');
        const wordHint = document.getElementById('word-hint');
        
        switch (this.gameState) {
            case 'waiting':
                startBtn.disabled = this.players.length < 2;
                startBtn.textContent = 'Start Game';
                wordHint.textContent = '...';
                break;
                
            case 'drawing':
            case 'guessing':
                startBtn.disabled = true;
                startBtn.textContent = 'Game in Progress';
                break;
                
            case 'finished':
                this.showGameOverScreen();
                break;
        }
    }

    /**
     * Add chat message to UI
     */
    addChatMessage(data) {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        
        // Remove empty state if present
        const emptyState = container.querySelector('.text-center');
        if (emptyState) {
            emptyState.remove();
        }
        
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${data.type}`;
        
        let messageContent = '';
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        switch (data.type) {
            case 'system':
                messageContent = `
                    <div class="text-cyan-300 text-sm mb-1">
                        <i class="fas fa-info-circle mr-1"></i> ${data.message}
                    </div>
                    <div class="text-xs text-gray-400 text-right">${timestamp}</div>
                `;
                break;
                
            case 'correct_guess':
                messageContent = `
                    <div class="player-name text-green-400">
                        <i class="fas fa-trophy mr-1"></i> ${data.player}
                    </div>
                    <div class="message-text">${data.message}</div>
                    <div class="text-xs text-gray-400 text-right">${timestamp}</div>
                `;
                this.playSound('correct');
                break;
                
            case 'guess':
                messageContent = `
                    <div class="player-name text-purple-300">${data.player}</div>
                    <div class="message-text" dir="auto">${data.message}</div>
                    <div class="text-xs text-gray-400 text-right">${timestamp}</div>
                `;
                break;
                
            default:
                messageContent = `
                    <div class="player-name text-cyan-300">${data.player}</div>
                    <div class="message-text" dir="auto">${data.message}</div>
                    <div class="text-xs text-gray-400 text-right">${timestamp}</div>
                `;
        }
        
        messageElement.innerHTML = messageContent;
        container.appendChild(messageElement);
        
        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
        
        // Play sound for new messages
        if (data.type !== 'system') {
            this.playSound('message');
        }
    }

    /**
     * Filter chat messages
     */
    filterChat(filter) {
        // Update active button
        document.querySelectorAll('.chat-filter').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.filter === filter) {
                btn.classList.add('active');
            }
        });
        
        // Implement filter logic
        // This is a simplified version - in production, you'd want to
        // store message types and filter accordingly
    }

    /**
     * Show game screen
     */
    showGameScreen() {
        document.getElementById('lobby-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        document.getElementById('game-over-screen').classList.add('hidden');
    }

    /**
     * Show lobby screen
     */
    showLobbyScreen() {
        document.getElementById('lobby-screen').classList.remove('hidden');
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.add('hidden');
        
        this.cleanupGame();
    }

    /**
     * Show game over screen
     */
    showGameOverScreen() {
        const sortedScores = Object.entries(this.scores)
            .sort((a, b) => b[1] - a[1]);
        
        if (sortedScores.length > 0) {
            const [winnerId, winnerScore] = sortedScores[0];
            const winner = this.players.find(p => p.id === winnerId);
            
            document.getElementById('winner-name').textContent = `Winner: ${winner?.username || 'Unknown'}`;
            document.getElementById('winner-score').textContent = winnerScore;
            
            // Update final leaderboard
            const leaderboardContainer = document.getElementById('final-leaderboard');
            leaderboardContainer.innerHTML = '';
            
            sortedScores.forEach(([playerId, score], index) => {
                const player = this.players.find(p => p.id === playerId);
                const entry = document.createElement('div');
                entry.className = `flex justify-between items-center p-3 mb-2 rounded-lg ${index === 0 ? 'bg-gradient-to-r from-yellow-500/20 to-yellow-600/20' : 'bg-gray-800/50'}`;
                
                entry.innerHTML = `
                    <div class="flex items-center">
                        <div class="text-2xl font-bold mr-4 ${index < 3 ? 'text-yellow-400' : 'text-gray-400'}">#${index + 1}</div>
                        <div class="w-10 h-10 rounded-full mr-3" style="background-color: ${player?.avatar_color || '#666'}"></div>
                        <div>
                            <div class="font-bold">${player?.username || 'Unknown'}</div>
                            <div class="text-sm text-gray-400">Player</div>
                        </div>
                    </div>
                    <div class="text-xl font-bold text-cyan-300">${score} pts</div>
                `;
                
                leaderboardContainer.appendChild(entry);
            });
        }
        
        document.getElementById('game-over-screen').classList.remove('hidden');
        this.playSound('game_over');
    }

    /**
     * Play again
     */
    playAgain() {
        if (this.socket && this.roomId) {
            this.socket.emit('start_game', {
                room_id: this.roomId
            });
            
            document.getElementById('game-over-screen').classList.add('hidden');
        }
    }

    /**
     * Back to lobby
     */
    backToLobby() {
        this.leaveRoom();
    }

    /**
     * Cleanup game resources
     */
    cleanupGame() {
        this.stopTimer();
        
        if (this.canvas) {
            this.canvas.destroy();
            this.canvas = null;
        }
        
        this.roomId = null;
        this.playerId = null;
        this.username = null;
        this.isDrawer = false;
        this.gameState = 'waiting';
        this.players = [];
        this.scores = {};
    }

    /**
     * Update connection status
     */
    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            const dot = statusElement.querySelector('.w-3');
            const text = statusElement.querySelector('span');
            
            if (connected) {
                dot.classList.remove('bg-red-500');
                dot.classList.add('bg-green-500');
                text.textContent = 'Connected';
            } else {
                dot.classList.remove('bg-green-500');
                dot.classList.add('bg-red-500');
                text.textContent = 'Disconnected';
            }
        }
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg max-w-sm ${this.getNotificationClass(type)}`;
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${this.getNotificationIcon(type)} mr-3"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    /**
     * Get notification CSS class
     */
    getNotificationClass(type) {
        switch (type) {
            case 'success': return 'bg-green-500/20 border border-green-500/30 text-green-300';
            case 'error': return 'bg-red-500/20 border border-red-500/30 text-red-300';
            case 'warning': return 'bg-yellow-500/20 border border-yellow-500/30 text-yellow-300';
            default: return 'bg-blue-500/20 border border-blue-500/30 text-blue-300';
        }
    }

    /**
     * Get notification icon
     */
    getNotificationIcon(type) {
        switch (type) {
            case 'success': return 'fa-check-circle';
            case 'error': return 'fa-exclamation-circle';
            case 'warning': return 'fa-exclamation-triangle';
            default: return 'fa-info-circle';
        }
    }

    /**
     * Get game state text
     */
    getGameStateText(state) {
        switch (state) {
            case 'waiting': return 'Waiting for players...';
            case 'drawing': return 'Drawing in progress';
            case 'guessing': return 'Guessing in progress';
            case 'finished': return 'Game finished';
            default: return state;
        }
    }

    /**
     * Play sound
     */
    playSound(type) {
        // In production, implement actual sound effects
        console.log(`Play sound: ${type}`);
    }

    /**
     * Toggle sound
     */
    toggleSound() {
        const btn = document.getElementById('sound-toggle');
        const icon = btn.querySelector('i');
        
        if (icon.classList.contains('fa-volume-up')) {
            icon.classList.remove('fa-volume-up');
            icon.classList.add('fa-volume-mute');
            this.showNotification('Sound muted', 'info');
        } else {
            icon.classList.remove('fa-volume-mute');
            icon.classList.add('fa-volume-up');
            this.showNotification('Sound enabled', 'info');
        }
    }
}

// Export for global access
window.Game = Game;