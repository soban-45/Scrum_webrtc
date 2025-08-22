
console.log("[AI SCRUM] Background service worker loaded ✅");

let peerConnection = null;
let dataChannel = null;
let isConnected = false;

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[AI SCRUM] Message received:", message);

  if (message.action === "startBot") {
    console.log("[AI SCRUM] Starting bot for Meet URL:", message.meetUrl);

    // Call your Django backend to start the bot
    fetch("http://127.0.0.1:8000/start-bot/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meet_url: message.meetUrl })
    })
      .then(response => response.json())
      .then(data => {
        console.log("[AI SCRUM] Backend response ✅:", data);
        sendResponse({ success: true, data });
      })
      .catch(error => {
        console.error("[AI SCRUM] Backend error ❌:", error);
        sendResponse({ success: false, error });
      });

    // Important: return true to keep sendResponse alive
    return true;
  }

  if (message.action === "connectWebRTC") {
    console.log("[AI SCRUM] Connecting to WebRTC...");
    connectToAIBot()
      .then(() => {
        sendResponse({ success: true, message: "WebRTC connected" });
      })
      .catch(error => {
        console.error("[AI SCRUM] WebRTC connection failed:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.action === "stopBot") {
    console.log("[AI SCRUM] Stopping bot...");
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
      dataChannel = null;
      isConnected = false;
    }
    sendResponse({ success: true, message: "Bot stopped" });
  }
});

async function connectToAIBot() {
  try {
    console.log("[WebRTC] Setting up peer connection...");
    
    // Create peer connection
    peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
      ],
      iceCandidatePoolSize: 10,
    });

    // Log ICE candidates
    peerConnection.onicecandidate = (event) => {
      console.log("[ICE] onicecandidate:", event.candidate);
    };

    // Create data channel for communication with AI
    dataChannel = peerConnection.createDataChannel("oai-events", {
      ordered: true,
      protocol: "json",
    });

    setupDataChannel();

    // Get user media (microphone)
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1,
        latency: 0.01,
      },
    });

    // Add audio track to WebRTC
    const [track] = stream.getAudioTracks();
    peerConnection.addTrack(track, stream);

    // Handle remote audio stream (AI responses)
    peerConnection.ontrack = (event) => {
      console.log("[WebRTC] Received remote audio track");
      // We'll handle audio playback in the content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "audioReceived",
          stream: event.streams[0]
        });
      });
    };

    // Create offer
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });

    await peerConnection.setLocalDescription(offer);

    // Send to backend
    const response = await fetch("http://127.0.0.1:8000/webrtc-signal/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sdp: peerConnection.localDescription.sdp,
        session_params: {
          model: "gpt-4o-realtime-preview-2024-12-17",
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }

    const data = await response.json();

    // Set remote description
    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: data.sdp,
    });

    console.log("[WebRTC] Connection established successfully!");
    isConnected = true;

  } catch (error) {
    console.error("[WebRTC] Connection failed:", error);
    throw error;
  }
}

function setupDataChannel() {
  dataChannel.addEventListener("open", () => {
    console.log("🔌 Data channel opened - Configuring AI session");

    // Configure AI session
    const sessionUpdate = {
      type: "session.update",
      session: {
        voice: "alloy",
        instructions: "You are a friendly AI assistant helping with Google Meet standup meetings. When the session starts, say 'Hello! I'm your AI Scrum Master. I'm now connected and ready to help facilitate your standup meeting. Please let me know when you'd like to begin!'",
        turn_detection: {
          type: "server_vad",
          threshold: 0.6,
          prefix_padding_ms: 500,
          silence_duration_ms: 3000,
        },
        input_audio_transcription: {
          model: "whisper-1",
          language: "en",
        },
      },
    };

    console.log("📤 Sending session update with AI instructions");
    sendData(sessionUpdate);

    // Auto-start welcome message
    setTimeout(() => {
      console.log("🚀 Auto-starting AI welcome message");
      const welcomeMessage = {
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions: "Say exactly: 'Hello! I'm your AI Scrum Master. I'm now connected and ready to help facilitate your standup meeting. Please let me know when you'd like to begin!'",
        },
      };
      sendData(welcomeMessage);
    }, 1000);
  });

  dataChannel.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data);
      handleServerEvent(data);
    } catch (error) {
      console.error("Error parsing data channel message:", error);
    }
  });

  dataChannel.addEventListener("error", (error) => {
    console.error("Data channel error:", error);
  });
}

function sendData(data) {
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send(JSON.stringify(data));
  } else {
    console.warn("Data channel not ready");
  }
}

function handleServerEvent(event) {
  console.log("[EVENT] type:", event.type, "payload:", JSON.stringify(event));

  // Send events to content script for handling
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "aiEvent",
        event: event
      });
    }
  });
}
