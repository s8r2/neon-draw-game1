from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import uuid
import socket
import threading
import time
import webbrowser
import platform
import os
from game_logic import GameManager

app = Flask(__name__)
app.config['SECRET_KEY'] = 'neon-draw-final-2024'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
CORS(app)

game_manager = GameManager()

# ========== NETWORK FUNCTIONS ==========
def get_local_ip():
    """Get local IP address automatically"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        try:
            return socket.gethostbyname(socket.gethostname())
        except:
            return "localhost"

def get_public_ip():
    """Get public IP (optional)"""
    try:
        import requests
        response = requests.get('https://api.ipify.org?format=json', timeout=3)
        return response.json()['ip']
    except:
        return None

def find_available_port(start_port=5000):
    """Find an available port starting from start_port"""
    import socket
    port = start_port
    max_attempts = 50  # Increased attempts for more reliability
    
    for i in range(max_attempts):
        try:
            # Try to bind to the port
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(('0.0.0.0', port))
            sock.close()
            return port
        except OSError:
            # Port is in use, try next one
            port += 1
    
    # If no port found, fallback to start_port
    print(f"⚠️  Could not find available port, using {start_port}")
    return start_port

def setup_firewall(port):
    """Setup Windows firewall for specific port"""
    if platform.system() == 'Windows':
        try:
            # Remove existing rule if exists
            os.system('netsh advfirewall firewall delete rule name="NeonDraw" > nul 2>&1')
            # Add new rule with the correct port
            os.system(f'netsh advfirewall firewall add rule name="NeonDraw" dir=in action=allow protocol=TCP localport={port}')
            print(f"✅ Firewall configured for port {port}")
        except:
            print("⚠️  Could not configure firewall automatically")

# ========== ROUTES ==========
@app.route('/')
def index():
    """Serve the main game interface"""
    return render_template('index.html')

@app.route('/create-room', methods=['POST'])
def create_room():
    """Create a new game room"""
    data = request.get_json()
    username = data.get('username', 'Player')
    max_players = data.get('max_players', 8)
    
    # Generate player ID
    player_id = str(uuid.uuid4())
    
    # Create room
    room_id = game_manager.create_room(player_id, username, max_players)
    
    return jsonify({
        'success': True,
        'room_id': room_id,
        'player_id': player_id,
        'username': username
    })

@app.route('/join-room', methods=['POST'])
def join_room_endpoint():
    """Join an existing room"""
    data = request.get_json()
    room_id = data.get('room_id', '').upper()
    username = data.get('username', 'Player')
    
    # Generate player ID
    player_id = str(uuid.uuid4())
    
    # Join room
    success = game_manager.join_room(room_id, player_id, username)
    
    if success:
        return jsonify({
            'success': True,
            'room_id': room_id,
            'player_id': player_id,
            'username': username
        })
    else:
        return jsonify({
            'success': False,
            'message': 'Room not found or game already started'
        })

@app.route('/room/<room_id>')
def room(room_id):
    """Room page"""
    if room_id in game_manager.rooms:
        return render_template('index.html')
    return "Room not found", 404

@app.route('/network-info')
def network_info():
    """Get network information for sharing"""
    local_ip = get_local_ip()
    public_ip = get_public_ip()
    
    return jsonify({
        'success': True,
        'local_ip': local_ip,
        'public_ip': public_ip,
        'local_url': f'http://{local_ip}:{PORT}',
        'public_url': f'http://{public_ip}:{PORT}' if public_ip else None,
        'localhost_url': f'http://localhost:{PORT}',
        'instructions': 'Share the local URL with friends on same WiFi network'
    })

@app.route('/system-info')
def system_info():
    """Get system information"""
    local_ip = get_local_ip()
    
    return jsonify({
        'local_ip': local_ip,
        'port': PORT,
        'python_version': platform.python_version(),
        'os': platform.system(),
        'server_running': True
    })

# ========== SOCKET.IO EVENTS ==========
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    emit('connected', {'message': 'Connected to server'})

@socketio.on('join')
def handle_join(data):
    """Handle player joining a room via socket"""
    room_id = data.get('room_id')
    player_id = data.get('player_id')
    
    if room_id in game_manager.rooms:
        join_room(room_id)
        room = game_manager.rooms[room_id]
        
        # Send room update to all clients
        emit('room_update', room.get_room_data(), room=room_id)
        
        # Send system message
        player = room.players.get(player_id)
        if player:
            emit('chat_message', {
                'type': 'system',
                'message': f'{player.username} joined the room',
                'timestamp': time.strftime('%H:%M')
            }, room=room_id)

@socketio.on('leave')
def handle_leave(data):
    """Handle player leaving a room"""
    room_id = data.get('room_id')
    player_id = data.get('player_id')
    
    if room_id in game_manager.rooms:
        room = game_manager.rooms[room_id]
        player = room.players.get(player_id)
        
        # Remove player
        game_manager.leave_room(room_id, player_id)
        leave_room(room_id)
        
        # Send update to remaining players
        if room_id in game_manager.rooms:
            emit('room_update', game_manager.rooms[room_id].get_room_data(), room=room_id)
            
            if player:
                emit('chat_message', {
                    'type': 'system',
                    'message': f'{player.username} left the room',
                    'timestamp': time.strftime('%H:%M')
                }, room=room_id)

@socketio.on('start_game')
def handle_start_game(data):
    """Handle game start"""
    room_id = data.get('room_id')
    
    if room_id in game_manager.rooms:
        room = game_manager.rooms[room_id]
        success = room.start_game()
        
        if success:
            turn_info = room.next_turn()
            emit('game_started', {
                **room.get_room_data(),
                **turn_info
            }, room=room_id)
            
            emit('chat_message', {
                'type': 'system',
                'message': 'Game started!',
                'timestamp': time.strftime('%H:%M')
            }, room=room_id)

@socketio.on('draw')
def handle_draw(data):
    """Handle drawing data"""
    room_id = data.get('room_id')
    draw_data = data.get('data')
    
    if room_id in game_manager.rooms:
        room = game_manager.rooms[room_id]
        room.canvas_data.append(draw_data)
        emit('draw_update', draw_data, room=room_id, include_self=False)

@socketio.on('clear_canvas')
def handle_clear_canvas(data):
    """Handle canvas clear"""
    room_id = data.get('room_id')
    if room_id in game_manager.rooms:
        room = game_manager.rooms[room_id]
        room.canvas_data = []
        emit('canvas_cleared', {}, room=room_id)

@socketio.on('chat_message')
def handle_chat_message(data):
    """Handle chat messages"""
    room_id = data.get('room_id')
    player_id = data.get('player_id')
    message = data.get('message')
    
    if room_id in game_manager.rooms:
        room = game_manager.rooms[room_id]
        player = room.players.get(player_id)
        
        if player and message.strip():
            # Check if it's a guess
            if room.game_state == "drawing" and player_id != room.current_drawer:
                guess_result = room.submit_guess(player_id, message)
                
                if guess_result['correct']:
                    emit('chat_message', {
                        'type': 'correct_guess',
                        'player': player.username,
                        'message': f'guessed the word: {guess_result["word"]}! +{guess_result["score"]} points',
                        'timestamp': time.strftime('%H:%M')
                    }, room=room_id)
                    
                    emit('room_update', room.get_room_data(), room=room_id)
                else:
                    emit('chat_message', {
                        'type': 'guess',
                        'player': player.username,
                        'message': message,
                        'timestamp': time.strftime('%H:%M')
                    }, room=room_id)
            else:
                emit('chat_message', {
                    'type': 'message',
                    'player': player.username,
                    'message': message,
                    'timestamp': time.strftime('%H:%M')
                }, room=room_id)

@socketio.on('get_room_data')
def handle_get_room_data(data):
    """Send room data to requesting client"""
    room_id = data.get('room_id')
    if room_id in game_manager.rooms:
        room = game_manager.rooms[room_id]
        emit('room_update', room.get_room_data())

# ========== GLOBAL PORT VARIABLE ==========
PORT = None

# ========== MAIN ENTRY POINT ==========
if __name__ == '__main__':
    # Find available port
    PORT = find_available_port(5000)
    
    # Setup firewall for the found port
    setup_firewall(PORT)
    
    # Get IP addresses
    local_ip = get_local_ip()
    public_ip = get_public_ip()
    
    # Display beautiful interface
    print("\n" + "═" * 60)
    print("🎮" + " " * 10 + "NEON DRAW & GUESS" + " " * 10 + "🎨")
    print("═" * 60)
    print(f"\n🚀 SERVER STARTED ON PORT: {PORT}")
    print("─" * 40)
    print(f"   🌐 Local Host:  http://localhost:{PORT}")
    print(f"   📶 Local IP:    http://{local_ip}:{PORT}")
    if public_ip:
        print(f"   🌍 Public IP:   http://{public_ip}:{PORT}")
    
    print("\n📢 HOW TO CONNECT:")
    print("─" * 40)
    print(f"   1. Open http://localhost:{PORT} on this device")
    print(f"   2. Share http://{local_ip}:{PORT} with friends on same WiFi")
    if public_ip:
        print(f"   3. Share http://{public_ip}:{PORT} for internet access")
    
    print("\n🔧 STATUS: ✅ Server is ready")
    print("═" * 60)
    print("\n⏳ Opening browser... (Press Ctrl+C to stop)\n")
    
    # Open browser automatically after a delay
    def open_browser_with_port():
        time.sleep(2)
        webbrowser.open(f"http://localhost:{PORT}")
    
    browser_thread = threading.Thread(target=open_browser_with_port, daemon=True)
    browser_thread.start()
    
    # Start server with dynamic port
    try:
        socketio.run(app, 
                    host='0.0.0.0', 
                    port=PORT, 
                    debug=False, 
                    allow_unsafe_werkzeug=True,
                    use_reloader=False,
                    log_output=True)
    except KeyboardInterrupt:
        print("\n\n✅ Server stopped gracefully")
    except Exception as e:
        print(f"\n❌ Server error: {e}")
        # Try alternative port if first fails
        alt_port = find_available_port(PORT + 1)
        print(f"💡 Trying alternative port {alt_port}...")
        try:
            PORT = alt_port
            socketio.run(app, 
                        host='0.0.0.0', 
                        port=PORT, 
                        debug=False, 
                        allow_unsafe_werkzeug=True,
                        use_reloader=False)
        except Exception as e2:
            print(f"❌ Failed to start server: {e2}")