import json
import random
import time
from datetime import datetime
from typing import Dict, List, Optional

class GameRoom:
    def __init__(self, room_id: str, host_id: str, max_players: int = 8):
        self.room_id = room_id
        self.host_id = host_id
        self.max_players = max_players
        self.players: Dict[str, Player] = {}
        self.game_state = "waiting"  # waiting, drawing, guessing, finished
        self.current_drawer: Optional[str] = None
        self.current_word: str = ""
        self.round_time = 80  # seconds
        self.round_start_time: Optional[float] = None
        self.round = 1
        self.max_rounds = 3
        self.word_list: List[str] = []
        self.chat_messages: List[Dict] = []
        self.canvas_data: List[Dict] = []
        self.scores: Dict[str, int] = {}
        self.word_hint: str = ""
        self.load_arabic_words()
        
    def load_arabic_words(self):
        """Load Arabic words from JSON file"""
        try:
            with open('data/arabic_words.json', 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.word_list = data['words']
        except:
            # Fallback words if file not found
            self.word_list = ["قلم", "كتاب", "شمس", "قمر", "بحر", "جبل", "زهرة", "بيت"]
    
    def add_player(self, player_id: str, username: str, avatar_color: str):
        """Add a new player to the room"""
        if len(self.players) >= self.max_players:
            return False
        if player_id not in self.players:
            self.players[player_id] = Player(player_id, username, avatar_color)
            self.scores[player_id] = 0
            return True
        return False
    
    def remove_player(self, player_id: str):
        """Remove a player from the room"""
        if player_id in self.players:
            del self.players[player_id]
            if player_id in self.scores:
                del self.scores[player_id]
            
            # If drawer leaves, end round
            if player_id == self.current_drawer:
                self.end_round()
            
            # If no players left or only one player, reset game
            if len(self.players) <= 1:
                self.game_state = "waiting"
    
    def start_game(self):
        """Start the game"""
        if len(self.players) < 2:
            return False
        
        self.game_state = "drawing"
        self.round = 1
        self.scores = {pid: 0 for pid in self.players}
        self.next_turn()
        return True
    
    def next_turn(self):
        """Move to next player's turn"""
        if not self.players:
            return
        
        player_ids = list(self.players.keys())
        
        # Choose next drawer
        if self.current_drawer:
            current_index = player_ids.index(self.current_drawer)
            next_index = (current_index + 1) % len(player_ids)
        else:
            next_index = 0
            
        self.current_drawer = player_ids[next_index]
        
        # Select random word
        self.current_word = random.choice(self.word_list)
        
        # Generate hint (show first and last letter)
        if len(self.current_word) > 2:
            self.word_hint = self.current_word[0] + "..." + self.current_word[-1]
        else:
            self.word_hint = ".."
        
        self.round_start_time = time.time()
        self.game_state = "drawing"
        self.canvas_data = []
        
        # Notify players
        return {
            'drawer': self.players[self.current_drawer].username,
            'word_hint': self.word_hint,
            'word_length': len(self.current_word),
            'round_time': self.round_time
        }
    
    def submit_guess(self, player_id: str, guess: str) -> Dict:
        """Process a player's guess"""
        guess_lower = guess.strip().lower()
        word_lower = self.current_word.lower()
        
        result = {
            'correct': False,
            'player': self.players[player_id].username,
            'guess': guess
        }
        
        if guess_lower == word_lower and player_id != self.current_drawer:
            # Calculate score based on speed
            elapsed = time.time() - self.round_start_time
            time_bonus = max(0, int((self.round_time - elapsed) * 10))
            base_score = 100
            total_score = base_score + time_bonus
            
            self.scores[player_id] += total_score
            
            # Give drawer some points too
            if self.current_drawer in self.scores:
                self.scores[self.current_drawer] += 50
            
            result['correct'] = True
            result['score'] = total_score
            result['word'] = self.current_word
            
            # End round early if word guessed
            self.end_round()
        
        return result
    
    def end_round(self):
        """End current round"""
        self.game_state = "between_rounds"
        
        # Check if game should continue
        if self.round >= self.max_rounds:
            self.game_state = "finished"
        else:
            self.round += 1
    
    def get_remaining_time(self) -> int:
        """Get remaining time in current round"""
        if not self.round_start_time:
            return self.round_time
        elapsed = time.time() - self.round_start_time
        return max(0, int(self.round_time - elapsed))
    
    def get_leaderboard(self) -> List[Dict]:
        """Get sorted leaderboard"""
        sorted_scores = sorted(self.scores.items(), key=lambda x: x[1], reverse=True)
        return [
            {
                'username': self.players[pid].username,
                'score': score,
                'avatar_color': self.players[pid].avatar_color
            }
            for pid, score in sorted_scores
        ]
    
    def get_room_data(self) -> Dict:
        """Get complete room data for clients"""
        return {
            'room_id': self.room_id,
            'players': [p.to_dict() for p in self.players.values()],
            'game_state': self.game_state,
            'current_drawer': self.players[self.current_drawer].username if self.current_drawer else None,
            'round': self.round,
            'max_rounds': self.max_rounds,
            'scores': self.scores,
            'word_hint': self.word_hint if self.game_state == "drawing" else "",
            'remaining_time': self.get_remaining_time(),
            'leaderboard': self.get_leaderboard()
        }

class Player:
    def __init__(self, player_id: str, username: str, avatar_color: str):
        self.id = player_id
        self.username = username
        self.avatar_color = avatar_color
        self.joined_at = datetime.now()
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'avatar_color': self.avatar_color
        }

class GameManager:
    def __init__(self):
        self.rooms: Dict[str, GameRoom] = {}
        self.room_codes = set()
    
    def create_room(self, host_id: str, username: str, max_players: int = 8) -> str:
        """Create a new game room"""
        room_id = self.generate_room_code()
        room = GameRoom(room_id, host_id, max_players)
        room.add_player(host_id, username, self.random_color())
        self.rooms[room_id] = room
        return room_id
    
    def join_room(self, room_id: str, player_id: str, username: str) -> bool:
        """Join an existing room"""
        if room_id in self.rooms:
            room = self.rooms[room_id]
            if room.game_state == "waiting":
                return room.add_player(player_id, username, self.random_color())
        return False
    
    def leave_room(self, room_id: str, player_id: str):
        """Leave a room"""
        if room_id in self.rooms:
            room = self.rooms[room_id]
            room.remove_player(player_id)
            
            # Clean up empty rooms
            if not room.players:
                del self.rooms[room_id]
    
    def generate_room_code(self) -> str:
        """Generate a unique 6-character room code"""
        import string
        while True:
            code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
            if code not in self.rooms:
                return code
    
    def random_color(self) -> str:
        """Generate a random avatar color"""
        colors = [
            '#FF6B6B', '#4ECDC4', '#FFD166', '#06D6A0', 
            '#118AB2', '#EF476F', '#073B4C', '#7209B7',
            '#3A86FF', '#FB5607', '#8338EC', '#FF006E'
        ]
        return random.choice(colors)