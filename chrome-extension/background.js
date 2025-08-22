
console.log("[AI SCRUM] Background service worker loaded ✅");

// WebRTC is handled in the content script due to missing WebRTC globals in service worker

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
    console.log("[AI SCRUM] Forwarding connectWebRTC to active tab");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ success: false, error: "No active tab" });
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: "connectWebRTC" }, sendResponse);
    });
    return true; // async
  }

  if (message.action === "startSpeaking") {
    console.log("[AI SCRUM] Forwarding startSpeaking to active tab");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ success: false, error: "No active tab" });
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: "startSpeaking" }, sendResponse);
    });
    return true; // async
  }

  if (message.action === "stopBot") {
    console.log("[AI SCRUM] Forwarding stopBot to active tab");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ success: false, error: "No active tab" });
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: "stopBot" }, sendResponse);
    });
    return true; // async
  }
});

// The rest of the WebRTC logic now lives in content.js
