import { useState, useEffect } from 'react';
import { Room, createLocalAudioTrack, Track } from 'livekit-client';
import './App.css';

// Default values for the agent
const defaultPrompt = `You are a helpful voice assistant. Please respond to the user's queries in a friendly and professional manner.`;

const defaultInstructions = `Greet the user and ask how you can assist them today. Be concise and helpful in your responses.`;

function App() {
  const [room, setRoom] = useState(null);
  const [connected, setConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    prompt: defaultPrompt,
    startingInstructions: defaultInstructions
  });
  const [promptHistory, setPromptHistory] = useState([]);
  const [maxHistoryCount, setMaxHistoryCount] = useState(5);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedItems, setExpandedItems] = useState(new Set());

  // Load settings and history from memory on component mount
  useEffect(() => {
    const savedSettings = {
      prompt: localStorage.getItem('agentPrompt') || defaultPrompt,
      startingInstructions: localStorage.getItem('agentInstructions') || defaultInstructions
    };
    setSettings(savedSettings);

    const savedMaxCount = localStorage.getItem('maxHistoryCount');
    if (savedMaxCount) {
      setMaxHistoryCount(parseInt(savedMaxCount));
    }
  }, []);

  // Save settings when they change
  useEffect(() => {
    localStorage.setItem('agentPrompt', settings.prompt);
    localStorage.setItem('agentInstructions', settings.startingInstructions);
  }, [settings]);

  // Save max history count when it changes
  useEffect(() => {
    localStorage.setItem('maxHistoryCount', maxHistoryCount.toString());
  }, [maxHistoryCount]);

  // Fetch prompt history from server
  const fetchPromptHistory = async () => {
    setLoadingHistory(true);
    try {
      const server_url = process.env.REACT_APP_TOKEN_SERVER_URL || 'http://localhost:8000';
      const response = await fetch(`${server_url}limit=${maxHistoryCount}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPromptHistory(data.history || []);
      } else {
        console.warn('Failed to fetch prompt history');
        setPromptHistory([]);
      }
    } catch (error) {
      console.warn('Error fetching prompt history:', error);
      setPromptHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load history when settings panel opens or max count changes
  useEffect(() => {
    if (showSettings) {
      fetchPromptHistory();
    }
  }, [showSettings, maxHistoryCount]);

  useEffect(() => {
    if (!room) return;

    const handleTrackSubscribed = (track, publication, participant) => {
      console.log(`Track subscribed: ${track.kind}`);

      if (track.kind === Track.Kind.Audio) {
        setIsSpeaking(true);
        const audioElement = track.attach();
        document.body.appendChild(audioElement);

        audioElement.onended = () => {
          setIsSpeaking(false);
          audioElement.remove();
        };
      }
    };

    const handleTrackUnsubscribed = (track, publication, participant) => {
      console.log(`Track unsubscribed: ${track.kind}`);

      if (track.kind === Track.Kind.Audio) {
        track.detach().forEach((element) => element.remove());
        setIsSpeaking(false);
      }
    };

    const handleDataReceived = (payload, participant, kind) => {
      const message = new TextDecoder().decode(payload);
      console.log(`Data message received from ${participant.identity}: ${message}`);
      setChatMessages(prev => [...prev, { sender: participant.identity, text: message }]);
    };

    room.on('trackSubscribed', handleTrackSubscribed);
    room.on('trackUnsubscribed', handleTrackUnsubscribed);
    room.on('dataReceived', handleDataReceived);

    return () => {
      room.off('trackSubscribed', handleTrackSubscribed);
      room.off('trackUnsubscribed', handleTrackUnsubscribed);
      room.off('dataReceived', handleDataReceived);
    };
  }, [room]);

  const connectToRoom = async () => {
    try {
      const server_url = process.env.REACT_APP_TOKEN_SERVER_URL || 'http://localhost:8000/api/token/mre-incoming';
      const userId = `user-${Math.random().toString(36).substring(2, 8)}`;
      const roomId = `room-${Math.random().toString(36).substring(2, 8)}`;

      console.log("Connecting to:", server_url);

      const resp = await fetch(server_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          room: roomId,
          user: userId,
          prompt: settings.prompt,
          instructions: settings.startingInstructions
        })
      });

      if (!resp.ok) {
        throw new Error(`HTTP error! status: ${resp.status}`);
      }

      const data = await resp.json();
      const token = data.token;

      const newRoom = new Room();
      console.log("Connecting to:", process.env.REACT_APP_LIVEKIT_WS_URL);
      console.log("Token:", token);
      await newRoom.connect(process.env.REACT_APP_LIVEKIT_WS_URL || 'wss://your-livekit-server.com', token);

      setRoom(newRoom);
      setConnected(true);

      const micTrack = await createLocalAudioTrack();
      await newRoom.localParticipant.publishTrack(micTrack);

      console.log('Connected and microphone publishing.');
    } catch (err) {
      console.error('Error connecting to Agent:', err);
      alert('Failed to connect to the voice agent. Please check your connection and try again.');
    }
  };

  const disconnectFromRoom = async () => {
    if (room) {
      await room.disconnect();
      setConnected(false);
      setRoom(null);
      setChatMessages([]);
      console.log('Disconnected.');
    }
  };

  const handleSettingsChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const resetToDefaults = () => {
    if (window.confirm('Are you sure you want to reset to default settings?')) {
      setSettings({
        prompt: defaultPrompt,
        startingInstructions: defaultInstructions
      });
    }
  };

  const loadPromptFromHistory = (historyItem) => {
    setSettings({
      prompt: historyItem.prompt,
      startingInstructions: historyItem.instructions
    });
  };

  const formatDate = (dateString) => {
    let date;
    
    // Handle different date formats from your API
    if (typeof dateString === 'object' && dateString.$numberLong) {
      // MongoDB timestamp format
      date = new Date(parseInt(dateString.$numberLong));
    } else if (typeof dateString === 'string' && dateString.includes('-')) {
      // ISO string format
      date = new Date(dateString);
    } else if (typeof dateString === 'number') {
      // Unix timestamp
      date = new Date(dateString * 1000);
    } else {
      // Try to parse as is
      date = new Date(dateString);
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
      hour: '2-digit', 
      minute: '2-digit'
    });
  };

  const truncateText = (text, maxLength = 80) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Add this function to handle expanding/collapsing items
  const toggleExpanded = (itemId) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Voice AI Agent</h1>
        <button 
          onClick={() => setShowSettings(!showSettings)} 
          className="settings-button"
        >
          {showSettings ? 'Hide Settings' : 'Settings'}
        </button>
      </header>

      {showSettings && (
        <div className="settings-panel">
          <h2>Agent Settings</h2>
          
          {/* History Count Setting */}
          <div className="form-group">
            <label htmlFor="maxHistoryCount">Number of recent prompts to show:</label>
            <select
              id="maxHistoryCount"
              value={maxHistoryCount}
              onChange={(e) => setMaxHistoryCount(parseInt(e.target.value))}
              className="history-count-select"
            >
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={20}>20</option>
            </select>
          </div>

          {/* Prompt History Section */}
          <div className="form-group">
            <div className="history-header">
              <label>Recent Prompts:</label>
              <button 
                onClick={fetchPromptHistory}
                className="refresh-button"
                disabled={loadingHistory}
              >
                {loadingHistory ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            
            <div className="prompt-history">
              {loadingHistory ? (
                <div className="loading">
                  <div className="loading-dot"></div>
                  <div className="loading-dot"></div>
                  <div className="loading-dot"></div>
                </div>
              ) : promptHistory.length > 0 ? (
                promptHistory.map((item, index) => {
                  const itemId = item._id || `item-${index}`;
                  const isExpanded = expandedItems.has(itemId);
                  
                  return (
                    <div key={itemId} className="history-item">
                      <div 
                        className="history-item-header"
                        onClick={() => toggleExpanded(itemId)}
                      >
                        <div className="history-preview">
                          <div className="history-prompt-preview">
                            {truncateText(item.prompt, 60)}
                          </div>
                          <div className="history-instructions-preview">
                            {truncateText(item.instructions, 80)}
                          </div>
                        </div>
                        <div className="history-meta">
                          <div className="history-date">
                            {formatDate(item.created_at)}
                          </div>
                          <button 
                            className={`expand-button ${isExpanded ? 'expanded' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpanded(itemId);
                            }}
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="history-item-content">
                          <div className="history-content-section">
                            <span className="history-content-label">Prompt:</span>
                            <div className="history-content-text">{item.prompt}</div>
                          </div>
                          
                          <div className="history-content-section">
                            <span className="history-content-label">Instructions:</span>
                            <div className="history-content-text">{item.instructions}</div>
                          </div>
                          
                          <button 
                            onClick={() => loadPromptFromHistory(item)}
                            className="use-prompt-button"
                          >
                            Use This Prompt
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="no-history">No recent prompts found</div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="prompt">Agent Prompt:</label>
            <textarea
              id="prompt"
              name="prompt"
              value={settings.prompt}
              onChange={handleSettingsChange}
              rows="10"
              placeholder="Enter the full prompt for the agent..."
            />
          </div>
          <div className="form-group">
            <label htmlFor="startingInstructions">Starting Instructions:</label>
            <textarea
              id="startingInstructions"
              name="startingInstructions"
              value={settings.startingInstructions}
              onChange={handleSettingsChange}
              rows="5"
              placeholder="Enter the starting instructions for the agent..."
            />
          </div>
          <div className="button-group">
            <button 
              onClick={() => setShowSettings(false)}
              className="save-button"
            >
              Save Settings
            </button>
            <button 
              onClick={resetToDefaults}
              className="reset-button"
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      )}

      <div className="main-content">
        {!connected ? (
          <button 
            onClick={connectToRoom} 
            className="call-button start-call"
            disabled={showSettings}
          >
            Start Call
          </button>
        ) : (
          <button 
            onClick={disconnectFromRoom} 
            className="call-button end-call"
          >
            End Call
          </button>
        )}

        {connected && (
          <div className="call-ui">
            <div className={`status-indicator ${isSpeaking ? 'speaking' : ''}`}>
              {isSpeaking ? '🎙️ Agent is speaking...' : '🔇 Agent is listening'}
            </div>

            <div className="chat-container">
              <h3>Conversation</h3>
              <div className="chat-messages">
                {chatMessages.length > 0 ? (
                  chatMessages.map((msg, idx) => (
                    <div key={idx} className={`message ${msg.sender.includes('user') ? 'user-message' : 'agent-message'}`}>
                      <span className="sender">{msg.sender}:</span>
                      <span className="message-text">{msg.text}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-chat">
                    Your conversation will appear here...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;