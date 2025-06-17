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
  
  // New states for transcript and feedback
  const [currentDocumentId, setCurrentDocumentId] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [transcriptError, setTranscriptError] = useState(false);
  const [transcriptLoadingProgress, setTranscriptLoadingProgress] = useState(0);

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
      const server_url = getBaseServerUrl();
      const response = await fetch(`${server_url}/api/token/mre-incoming?limit=${maxHistoryCount}`, {
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
  
  // Helper function to get base server URL
  const getBaseServerUrl = () => {
    const envUrl = process.env.REACT_APP_TOKEN_SERVER_URL || 'http://localhost:8000';
    // Remove any trailing endpoint paths to get just the base URL
    return envUrl.replace(/\/api\/.*$/, '');
  };

  // Fetch conversation transcript with retry logic
  const fetchTranscriptWithRetry = async (documentId) => {
    const maxRetries = 30; // 20 seconds max wait time
    const retryInterval = 1000; // 1 second between retries
    let retryCount = 0;

    setLoadingTranscript(true);
    setTranscriptError(false);
    setTranscriptLoadingProgress(0);

    const attemptFetch = async () => {
      try {
        const server_url = getBaseServerUrl();
        const response = await fetch(`${server_url}/api/conversation/${documentId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.conversation && data.conversation.length > 0) {
            setTranscript(data.conversation);
            setLoadingTranscript(false);
            return true; // Success
          }
        }
        
        // If we get here, transcript is not ready yet
        retryCount++;
        setTranscriptLoadingProgress((retryCount / maxRetries) * 100);
        
        if (retryCount >= maxRetries) {
          // Max retries reached
          setTranscriptError(true);
          setLoadingTranscript(false);
          setTranscript([]);
          return false;
        }
        
        // Wait and retry
        setTimeout(attemptFetch, retryInterval);
        return null; // Continue retrying
        
      } catch (error) {
        console.warn('Error fetching transcript:', error);
        retryCount++;
        setTranscriptLoadingProgress((retryCount / maxRetries) * 100);
        
        if (retryCount >= maxRetries) {
          setTranscriptError(true);
          setLoadingTranscript(false);
          setTranscript([]);
          return false;
        }
        
        setTimeout(attemptFetch, retryInterval);
        return null;
      }
    };

    await attemptFetch();
  };

  // Original fetch function (keeping for backward compatibility)
  const fetchTranscript = async (documentId) => {
    setLoadingTranscript(true);
    try {
      const server_url = getBaseServerUrl();
      const response = await fetch(`${server_url}/api/conversation/${documentId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const data = await response.json();
        setTranscript(data.conversation || []);
      } else {
        console.warn('Failed to fetch transcript');
        setTranscript([]);
      }
    } catch (error) {
      console.warn('Error fetching transcript:', error);
      setTranscript([]);
    } finally {
      setLoadingTranscript(false);
    }
  };

  // Submit feedback
  const submitFeedback = async (quality) => {
    if (!currentDocumentId) return;
    
    setSubmittingFeedback(true);
    try {
      const server_url = getBaseServerUrl();
      const response = await fetch(`${server_url}/api/conversation/${currentDocumentId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          document_id: currentDocumentId,
          conversation_quality: quality,
          feedback_comment: ""
        })
      });

      if (response.ok) {
        setFeedbackSubmitted(true);
        console.log('Feedback submitted successfully');
      } else {
        console.error('Failed to submit feedback');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // Reset transcript and feedback state
  const resetTranscriptState = () => {
    setShowTranscript(false);
    setTranscript([]);
    setCurrentDocumentId(null);
    setFeedbackSubmitted(false);
    setTranscriptError(false);
    setTranscriptLoadingProgress(0);
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
    // Reset transcript state when starting a new call
    resetTranscriptState();
    
    try {
      const server_url = getBaseServerUrl();
      const token_endpoint = `${server_url}/api/token/mre-incoming`;
      const userId = `user-${Math.random().toString(36).substring(2, 8)}`;
      const roomId = `room-${Math.random().toString(36).substring(2, 8)}`;

      console.log("Connecting to:", token_endpoint);

      const resp = await fetch(token_endpoint, {
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

      // Extract document ID from the token metadata
      try {
        const tokenPayload = JSON.parse(atob(token.split('.')[1]));
        if (tokenPayload.metadata) {
          const metadata = JSON.parse(tokenPayload.metadata);
          setCurrentDocumentId(metadata.document_id);
        }
      } catch (e) {
        console.warn('Could not extract document ID from token');
      }

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
      
      // Show transcript loading and fetch with retry
      if (currentDocumentId) {
        setShowTranscript(true);
        await fetchTranscriptWithRetry(currentDocumentId);
      }
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

  const formatTranscriptContent = (content) => {
    if (typeof content === 'string') {
      return content;
    } else if (typeof content === 'object' && content.text) {
      return content.text;
    } else if (Array.isArray(content) && content.length > 0) {
      return content[0].text || content[0];
    }
    return 'No content available';
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
        {!connected && !showTranscript ? (
          <button 
            onClick={connectToRoom} 
            className="call-button start-call"
            disabled={showSettings}
          >
            Start Call
          </button>
        ) : connected ? (
          <button 
            onClick={disconnectFromRoom} 
            className="call-button end-call"
          >
            End Call
          </button>
        ) : null}

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

        {/* Transcript Section */}
        {showTranscript && (
          <div className="transcript-section">
            <div className="transcript-header">
              <h2>Conversation Transcript</h2>
              <button 
                onClick={() => {
                  resetTranscriptState();
                }}
                className="new-call-button"
              >
                Start New Call
              </button>
            </div>

            {loadingTranscript ? (
              <div className="transcript-loading">
                <div className="transcript-loading-container">
                  <div className="transcript-loading-spinner">
                    <div className="spinner-ring"></div>
                    <div className="spinner-ring"></div>
                    <div className="spinner-ring"></div>
                    <div className="spinner-ring"></div>
                  </div>
                  <h3>Processing Conversation...</h3>
                  <p>Please wait while we prepare your transcript</p>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${transcriptLoadingProgress}%` }}
                    ></div>
                  </div>
                  <div className="progress-text">
                    {Math.round(transcriptLoadingProgress)}% - Checking for transcript availability...
                  </div>
                </div>
              </div>
            ) : transcriptError ? (
              <div className="transcript-error">
                <div className="error-icon">⚠️</div>
                <h3>Transcript Unavailable</h3>
                <p>We couldn't retrieve the conversation transcript at this time.</p>
                <p>This might happen if:</p>
                <ul>
                  <li>The conversation was too short</li>
                  <li>There was a technical issue during processing</li>
                  <li>The transcript is still being processed (try again later)</li>
                </ul>
                <button 
                  onClick={() => {
                    if (currentDocumentId) {
                      fetchTranscriptWithRetry(currentDocumentId);
                    }
                  }}
                  className="retry-button"
                >
                  Try Again
                </button>
              </div>
            ) : transcript.length > 0 ? (
              <div className="transcript-container">
                <div className="transcript-messages">
                  {transcript.map((message, index) => (
                    <div 
                      key={message.id || index} 
                      className={`transcript-message ${message.role === 'user' ? 'user-transcript' : 'assistant-transcript'}`}
                    >
                      <div className="transcript-role">
                        {message.role === 'user' ? 'You' : 'Assistant'}
                      </div>
                      <div className="transcript-content">
                        {formatTranscriptContent(message.content)}
                      </div>
                      {message.interrupted && (
                        <div className="transcript-interrupted">
                          (Interrupted)
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Feedback Section */}
                {!feedbackSubmitted ? (
                  <div className="feedback-section">
                    <h3>How was this conversation?</h3>
                    <div className="feedback-buttons">
                      <button 
                        onClick={() => submitFeedback('Good')}
                        className="feedback-button thumbs-up"
                        disabled={submittingFeedback}
                      >
                        <span className="feedback-icon">👍</span>
                        <span>Good</span>
                      </button>
                      <button 
                        onClick={() => submitFeedback('Bad')}
                        className="feedback-button thumbs-down"
                        disabled={submittingFeedback}
                      >
                        <span className="feedback-icon">👎</span>
                        <span>Bad</span>
                      </button>
                    </div>
                    {submittingFeedback && (
                      <div className="feedback-submitting">
                        Submitting feedback...
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="feedback-submitted">
                    <h3>Thank you for your feedback! 🎉</h3>
                    <p>Your feedback helps us improve the AI assistant.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-transcript">
                <p>No conversation transcript available.</p>
                <p>The transcript may still be processing or the conversation was too short.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;