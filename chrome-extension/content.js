
console.log("[AI SCRUM] Content script loaded ✅");

let remoteAudioElement = null;

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

        const meetUrl = window.location.href;
        
        // Update button to show loading state
        btn.innerText = "Starting Bot...";
        btn.disabled = true;
        
        // First, start the bot and wait for admission
        chrome.runtime.sendMessage({ action: "startBot", meetUrl }, (response) => {
          console.log("[AI SCRUM] Bot start response:", response);
          
          if (response && response.success) {
            // Bot started successfully, now show the popup
            btn.innerText = "Bot Admitted ✅";
            setTimeout(() => {
              // Use the popup function from the separate popup.js file
              if (window.AIScrumPopup && window.AIScrumPopup.showPopupCard) {
                window.AIScrumPopup.showPopupCard();
              } else {
                console.error("[AI SCRUM] Popup functionality not available");
              }
              // Reset button
              btn.innerText = "AI SCRUM";
              btn.disabled = false;
            }, 2000);
          } else {
            // Error starting bot
            btn.innerText = "Bot Failed ❌";
            setTimeout(() => {
              btn.innerText = "AI SCRUM";
              btn.disabled = false;
            }, 3000);
          }
        });
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
