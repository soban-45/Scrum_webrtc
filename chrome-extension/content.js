
console.log("[AI SCRUM] Content script loaded ✅");

let remoteAudioElement = null;
let peerConnection = null;
let dataChannel = null;
let isConnected = false;

// Turn-based conversation state
let isAssistantSpeaking = false;
let isUserSpeaking = false;
let userAudioTrack = null;
let userStream = null;

// Audio completion tracking
let audioState = {
  isAudioPlaying: false,
  isTranscriptComplete: false,
  isResponseComplete: false,
  isAudioStreamComplete: false,
  currentResponseId: null,
  unmuteTimeoutId: null,
  audioProgressCheckInterval: null,
  lastAudioTime: 0,
  audioEndedNaturally: false,
};

// Create remote audio element for AI responses
function createRemoteAudioElement() {
  if (!remoteAudioElement) {
    remoteAudioElement = document.createElement("audio");
    remoteAudioElement.autoplay = true;
    remoteAudioElement.style.display = "none";
    document.body.appendChild(remoteAudioElement);
    console.log("[AI SCRUM] Remote audio element created");
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[AI SCRUM] Content received message:", message);

  // Handle WebRTC connect request from background/popup
  if (message.action === "connectWebRTC") {
    connectToAIBot()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    return true; // async response
  }

  // Handle start speaking request
  if (message.action === "startSpeaking") {
    console.log("[DEBUG] startSpeaking called - isConnected:", isConnected, "dataChannel state:", dataChannel?.readyState);
    
    if (!isConnected || !dataChannel || dataChannel.readyState !== "open") {
      console.log("[DEBUG] WebRTC not ready - waiting for connection...");
      // Wait a bit for data channel to open if connection is in progress
      setTimeout(() => {
        if (isConnected && dataChannel && dataChannel.readyState === "open") {
          console.log("[DEBUG] Data channel now ready, starting AI conversation");
          startAIConversation();
          sendResponse({ success: true });
        } else {
          console.log("[DEBUG] Still not ready after timeout");
          sendResponse({ success: false, error: "WebRTC not connected" });
        }
      }, 2000); // Wait 2 seconds for data channel to open
      return true; // async response
    }
    
    startAIConversation();
    sendResponse({ success: true });
    return; 
  }

  // Stop and cleanup
  if (message.action === "stopBot") {
    console.log("🛑 Stopping AI session and cleaning up");
    
    // Stop audio monitoring
    stopAudioProgressMonitoring();
    
    // Reset conversation state
    isAssistantSpeaking = false;
    isUserSpeaking = false;
    resetAudioState();
    
    // Unmute microphone if it was muted
    if (userAudioTrack && !userAudioTrack.enabled) {
      userAudioTrack.enabled = true;
    }
    
    // Close WebRTC connection
    if (peerConnection) {
      try { peerConnection.close(); } catch (e) {}
      peerConnection = null;
    }
    
    // Stop user media stream
    if (userStream) {
      userStream.getTracks().forEach(track => track.stop());
      userStream = null;
      userAudioTrack = null;
    }
    
    dataChannel = null;
    isConnected = false;
    sendResponse && sendResponse({ success: true });
    return;
  }

  if (message.action === "audioReceived") {
    console.log("[AI SCRUM] Setting up remote audio stream");
    createRemoteAudioElement();
    if (remoteAudioElement && message.stream) {
      remoteAudioElement.srcObject = message.stream;
    }
  }

  if (message.action === "aiEvent") {
    handleAIEvent(message.event);
  }
});

function handleAIEvent(event) {
  console.log("[AI EVENT]", event.type, event);

  // Handle different AI events
  switch (event.type) {
    case "session.created":
    case "session.updated":
      console.log("✅ AI Session configured");
      break;

    case "response.created":
      console.log("🤖 AI is starting to respond");
      break;

    case "response.done":
      console.log("✅ AI response complete");
      break;

    case "response.audio_transcript.done":
      if (event.transcript) {
        console.log("🗣️ AI said:", event.transcript);
        // You can display this in the popup or inject into Meet chat
        updatePopupWithAIResponse(event.transcript);
      }
      break;

    case "input_audio_buffer.speech_started":
      console.log("👂 User started speaking");
      break;

    case "input_audio_buffer.speech_stopped":
      console.log("🛑 User stopped speaking");
      break;

    case "conversation.item.input_audio_transcription.completed":
      if (event.transcript) {
        console.log("📝 User said:", event.transcript);
        updatePopupWithUserMessage(event.transcript);
      }
      break;
  }
}

// ---------------- WebRTC in content script ----------------
async function connectToAIBot() {
  try {
    console.log("[WebRTC] Setting up peer connection in content script...");

    // Create peer connection
    peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
      ],
      iceCandidatePoolSize: 10,
    });

    peerConnection.onicecandidate = (event) => {
      console.log("[ICE] onicecandidate:", event.candidate);
    };

    // Create data channel
    dataChannel = peerConnection.createDataChannel("oai-events", {
      ordered: true,
      protocol: "json",
    });
    setupDataChannel();

    // Get mic
    userStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1,
        latency: 0.01,
      },
    });
    userAudioTrack = userStream.getAudioTracks()[0];
    peerConnection.addTrack(userAudioTrack, userStream);

    // Remote audio
    peerConnection.ontrack = (event) => {
      console.log("[WebRTC] Received remote audio track (content)");
      createRemoteAudioElement();
      if (remoteAudioElement) {
        remoteAudioElement.srcObject = event.streams[0];
        
        // Add event listeners for audio completion
        remoteAudioElement.addEventListener('ended', () => {
          console.log("🎵 Remote audio ended naturally");
          audioState.audioEndedNaturally = true;
          audioState.isAudioPlaying = false;
          checkAndUnmuteMicrophone("audio_ended", audioState.currentResponseId);
        });
        
        remoteAudioElement.addEventListener('pause', () => {
          console.log("⏸️ Remote audio paused");
          audioState.isAudioPlaying = false;
          checkAndUnmuteMicrophone("audio_paused", audioState.currentResponseId);
        });
      }
    };

    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
    await peerConnection.setLocalDescription(offer);

    // Send SDP to backend
    const response = await fetch("http://127.0.0.1:8000/webrtc-signal/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sdp: peerConnection.localDescription.sdp,
        session_params: { model: "gpt-4o-realtime-preview-2024-12-17" },
      }),
    });
    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }
    const data = await response.json();
    await peerConnection.setRemoteDescription({ type: "answer", sdp: data.sdp });
    console.log("[WebRTC] Connection established successfully (content)!");
    // Note: isConnected will be set to true when data channel opens
  } catch (error) {
    console.error("[WebRTC] Connection failed (content):", error);
    throw error;
  }
}

function setupDataChannel() {
  dataChannel.addEventListener("open", () => {
    console.log("🔌 Data channel opened - configuring AI session (content)");
    isConnected = true; // Set connected flag when data channel is actually open
    const sessionUpdate = {
      type: "session.update",
      session: {
        voice: "alloy",
        instructions:
          "You are a friendly AI assistant helping with Google Meet standup meetings.",
        turn_detection: {
          type: "server_vad",
          threshold: 0.6,
          prefix_padding_ms: 500,
          silence_duration_ms: 3000,
        },
        input_audio_transcription: { model: "whisper-1", language: "en" },
      },
    };
    sendData(sessionUpdate);
  });

  dataChannel.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerEvent(data);
    } catch (error) {
      console.error("Error parsing data channel message (content):", error);
    }
  });

  dataChannel.addEventListener("error", (error) => {
    console.error("Data channel error (content):", error);
  });
}

function sendData(data) {
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify(data));
  } else {
    console.warn("Data channel not ready (content)");
  }
}

// Start AI conversation with welcome message
function startAIConversation() {
  console.log("🚀 Starting AI conversation");
  const welcomeMessage = {
    type: "response.create",
    response: {
      modalities: ["audio", "text"],
      instructions:
        "Hello! I'm your AI Scrum Master. I'm connected and ready to help facilitate your standup meeting. I'll guide you through the standup process. Please tell me when you're ready to begin.",
    },
  };
  sendData(welcomeMessage);
}

// Mic management functions
function muteMicrophone() {
  if (userAudioTrack && userAudioTrack.readyState === "live") {
    userAudioTrack.enabled = false;
    console.log("🔇 MICROPHONE MUTED - AI is speaking, user mic disabled");
  } else {
    console.warn("⚠️ Cannot mute microphone: track not available or not live");
  }
}

function unmuteMicrophone() {
  if (userAudioTrack && userAudioTrack.readyState === "live") {
    userAudioTrack.enabled = true;
    console.log("🎤 MICROPHONE UNMUTED - User can speak now");
  } else {
    console.warn("⚠️ Cannot unmute microphone: track not available or not live");
  }
}

// Audio completion checking
function checkAndUnmuteMicrophone(eventType, responseId) {
  console.log(`📊 Audio completion check from ${eventType}:`, {
    isAudioPlaying: audioState.isAudioPlaying,
    isTranscriptComplete: audioState.isTranscriptComplete,
    isResponseComplete: audioState.isResponseComplete,
    isAudioStreamComplete: audioState.isAudioStreamComplete,
    audioEndedNaturally: audioState.audioEndedNaturally,
    responseId: audioState.currentResponseId,
  });

  // For audio track ended event, unmute immediately if other conditions are met
  if (eventType === "audio_track_ended" && audioState.audioEndedNaturally) {
    console.log("✅ Audio track ended naturally - Safe to unmute");
    isAssistantSpeaking = false;
    unmuteMicrophone();
    resetAudioState();
    return;
  }

  // For other events, ensure all conditions are met and audio is truly finished
  const allConditionsMet =
    !audioState.isAudioPlaying &&
    audioState.isTranscriptComplete &&
    audioState.isResponseComplete &&
    audioState.isAudioStreamComplete;

  if (allConditionsMet) {
    // Double-check that audio element is not playing
    const remoteAudio = remoteAudioElement;
    const isAudioElementPlaying =
      remoteAudio &&
      !remoteAudio.paused &&
      !remoteAudio.ended &&
      remoteAudio.readyState > 0;

    if (isAudioElementPlaying) {
      console.log("🔄 Audio element still playing, waiting for natural end");
      return;
    }

    console.log("✅ All conditions met - Unmuting microphone");
    isAssistantSpeaking = false;
    unmuteMicrophone();
    resetAudioState();
  } else {
    console.log("⏳ Waiting for all conditions to be met before unmuting");
  }
}

function resetAudioState() {
  stopAudioProgressMonitoring();
  audioState.isAudioPlaying = false;
  audioState.isTranscriptComplete = false;
  audioState.isResponseComplete = false;
  audioState.isAudioStreamComplete = false;
  audioState.currentResponseId = null;
  audioState.audioEndedNaturally = false;
  audioState.lastAudioTime = 0;
}

function startAudioProgressMonitoring() {
  if (audioState.audioProgressCheckInterval) {
    clearInterval(audioState.audioProgressCheckInterval);
  }
  
  audioState.audioProgressCheckInterval = setInterval(() => {
    const remoteAudio = remoteAudioElement;
    if (remoteAudio && !remoteAudio.paused && !remoteAudio.ended) {
      audioState.lastAudioTime = remoteAudio.currentTime;
    } else {
      console.log("🎵 Audio monitoring: Audio has stopped");
      audioState.isAudioPlaying = false;
      stopAudioProgressMonitoring();
      checkAndUnmuteMicrophone("audio_monitoring", audioState.currentResponseId);
    }
  }, 100);
}

function stopAudioProgressMonitoring() {
  if (audioState.audioProgressCheckInterval) {
    clearInterval(audioState.audioProgressCheckInterval);
    audioState.audioProgressCheckInterval = null;
  }
}

function handleServerEvent(event) {
  console.log("[EVENT] type:", event.type, "payload:", JSON.stringify(event));
  
  try {
    // Handle session events
    if (event.type === "session.created" || event.type === "session.updated") {
      console.log("✅ Session configured");
      return;
    }

    // Handle response management
    if (event.type === "response.created") {
      console.log("🤖 AI starting to speak:", event.response?.id);
      
      // Initialize audio state for new response
      audioState.isAudioPlaying = true;
      audioState.isTranscriptComplete = false;
      audioState.isResponseComplete = false;
      audioState.isAudioStreamComplete = false;
      audioState.audioEndedNaturally = false;
      audioState.currentResponseId = event.response?.id;

      // Clear any pending unmute timeouts
      if (audioState.unmuteTimeoutId) {
        clearTimeout(audioState.unmuteTimeoutId);
        audioState.unmuteTimeoutId = null;
      }

      isAssistantSpeaking = true;
      muteMicrophone();
      return;
    }

    if (event.type === "response.done") {
      console.log("✅ AI response complete:", event.response?.id);
      audioState.isResponseComplete = true;
      checkAndUnmuteMicrophone("response.done", event.response?.id);
      return;
    }

    // Handle audio buffer events
    if (event.type === "response.audio.delta") {
      console.log("🎵 AI is actively speaking");
      if (!isAssistantSpeaking) {
        isAssistantSpeaking = true;
        muteMicrophone();
      }
      if (!audioState.isAudioPlaying) {
        audioState.isAudioPlaying = true;
        startAudioProgressMonitoring();
      }
      return;
    }

    if (event.type === "response.audio.done") {
      console.log("🎵 Audio stream complete:", event.response_id);
      audioState.isAudioPlaying = false;
      audioState.isAudioStreamComplete = true;
      stopAudioProgressMonitoring();
      checkAndUnmuteMicrophone("response.audio.done", event.response_id);
      return;
    }

    // Handle output audio buffer events
    if (event.type === "response.output_audio_buffer.started") {
      console.log("🔇 Muting microphone - AI starting to speak");
      isAssistantSpeaking = true;
      muteMicrophone();
      audioState.isAudioPlaying = true;
      audioState.audioEndedNaturally = false;
      startAudioProgressMonitoring();
      return;
    }

    if (event.type === "output_audio_buffer.stopped") {
      console.log("🎤 Audio playback ended, unmuting microphone");
      audioState.isAudioPlaying = false;
      audioState.audioEndedNaturally = true;
      stopAudioProgressMonitoring();
      isAssistantSpeaking = false;
      unmuteMicrophone();
      resetAudioState();
      return;
    }

    // Handle input audio events
    if (event.type === "input_audio_buffer.speech_started") {
      console.log("👂 User started speaking");
      isUserSpeaking = true;
      return;
    }

    if (event.type === "input_audio_buffer.speech_stopped") {
      console.log("🛑 User finished speaking");
      isUserSpeaking = false;
      return;
    }

    // Handle input audio transcription events
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      console.log("📝 User said:", event.transcript);
      if (event.transcript && event.transcript.trim()) {
        // Wait 2 seconds after user finishes speaking before AI responds
        setTimeout(() => {
          if (!isAssistantSpeaking && isConnected) {
            console.log("⏰ 2 seconds passed, AI can respond now");
            // AI will automatically respond based on the conversation
          }
        }, 2000);
      }
      return;
    }

    // Handle assistant transcript events
    if (event.type === "response.audio_transcript.delta") {
      if (!isAssistantSpeaking) {
        console.log("🔇 First AI transcript - Ensuring mic is muted");
        isAssistantSpeaking = true;
        muteMicrophone();
      }
      return;
    }

    if (event.type === "response.audio_transcript.done") {
      console.log("🗣️ AI said:", event.transcript);
      audioState.isTranscriptComplete = true;
      checkAndUnmuteMicrophone("response.audio_transcript.done", event.response_id);
      return;
    }

    // Reuse existing UI hooks for popup updates
    handleAIEvent(event);
    
  } catch (error) {
    console.error("❌ Error handling server event:", error);
  }
}

function updatePopupWithAIResponse(message) {
  // Update the popup if it exists
  const popup = document.getElementById('ai-scrum-popup-card');
  if (popup) {
    // You can add a chat area to show the conversation
    console.log("AI Response:", message);
  }
}

function updatePopupWithUserMessage(message) {
  // Update the popup if it exists
  const popup = document.getElementById('ai-scrum-popup-card');
  if (popup) {
    console.log("User Message:", message);
  }
}

// Wait until Google Meet toolbar is ready
function waitForToolbar() {
  const toolbar = document.querySelector('[aria-label="Call controls"]');
  if (toolbar) {
    console.log("[AI SCRUM] Toolbar found ✅");

    // Prevent duplicate button injection
    if (!document.getElementById("ai-scrum-btn")) {
      const btn = document.createElement("button");
      btn.id = "ai-scrum-btn";
      btn.innerText = "AI SCRUM";
      btn.style.cssText = `
        background: #1a73e8;
        color: white;
        border: none;
        padding: 6px 12px;
        margin-left: 10px;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
      `;

      btn.addEventListener("click", () => {
        console.log("[AI SCRUM] Button clicked 🚀");

        // Just open the popup - WebRTC connection will happen when Start is clicked
        if (window.AIScrumPopup && window.AIScrumPopup.showPopupCard) {
          window.AIScrumPopup.showPopupCard();
        } else {
          console.error("[AI SCRUM] Popup functionality not available");
        }
      });

      toolbar.appendChild(btn);
      console.log("[AI SCRUM] Button injected ✅");
    }
  } else {
    console.log("[AI SCRUM] Waiting for toolbar...");
    setTimeout(waitForToolbar, 2000);
  }
}

// Run after page loads
window.addEventListener("load", () => {
  console.log("[AI SCRUM] Page loaded, checking toolbar...");
  waitForToolbar();
});
