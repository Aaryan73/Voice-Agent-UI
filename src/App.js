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
    prompt: localStorage.getItem('agentPrompt') || defaultPrompt,
    startingInstructions: localStorage.getItem('agentInstructions') || defaultInstructions
  });

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('agentPrompt', settings.prompt);
    localStorage.setItem('agentInstructions', settings.startingInstructions);
  }, [settings]);

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
