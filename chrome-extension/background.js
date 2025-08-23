
console.log("[AI SCRUM] Background service worker loaded ✅");

const BACKEND_URL = "http://localhost:8000";

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[AI SCRUM] Message received:", message);

  // Backend API calls
  if (message.action === "fetchProjects") {
    console.log("[AI SCRUM] Fetching projects for email:", message.email);
    
    fetch(`${BACKEND_URL}/projects/?email=${encodeURIComponent(message.email.trim())}`)
      .then(response => {
        if (!response.ok) {
          return response.json().then(errorData => {
            throw new Error(errorData.error || 'Failed to fetch projects');
          });
        }
        return response.json();
      })
      .then(data => {
        console.log("[AI SCRUM] Projects fetched ✅:", data.length, "projects");
        sendResponse({ success: true, data });
      })
      .catch(error => {
        console.error("[AI SCRUM] Fetch projects error ❌:", error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // async
  }

  if (message.action === "fetchProjectDetails") {
    console.log("[AI SCRUM] Fetching project details for ID:", message.projectId);
    
    fetch(`${BACKEND_URL}/projects/?project_id=${message.projectId}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to fetch project details: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log("[AI SCRUM] Project details fetched ✅:", data.project_name);
        sendResponse({ success: true, data });
      })
      .catch(error => {
        console.error("[AI SCRUM] Fetch project details error ❌:", error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // async
  }

  if (message.action === "fetchAllLastStandups") {
    console.log("[AI SCRUM] Fetching last standups for", message.members.length, "members");
    
    const promises = message.members.map(async (member) => {
      try {
        const response = await fetch(`${BACKEND_URL}/employee-last-standup/?employee_id=${encodeURIComponent(member.employee_id)}`);
        if (!response.ok) {
          return { id: member.employee_id, name: member.name, data: null };
        }
        const json = await response.json();
        return { id: member.employee_id, name: member.name, data: json.data || null };
      } catch (error) {
        console.error(`Error fetching standup for ${member.name}:`, error);
        return { id: member.employee_id, name: member.name, data: null };
      }
    });

    Promise.all(promises)
      .then(results => {
        const map = {};
        results.forEach((result) => {
          map[result.id] = result.data || null;
        });
        console.log("[AI SCRUM] Last standups fetched ✅");
        sendResponse({ success: true, data: map });
      })
      .catch(error => {
        console.error("[AI SCRUM] Fetch last standups error ❌:", error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // async
  }

  if (message.action === "downloadExcel") {
    console.log("[AI SCRUM] Downloading Excel for project:", message.projectId);
    
    fetch(`${BACKEND_URL}/download-excel/?project_id=${message.projectId}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status}`);
        }
        return response.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({
          url: url,
          filename: `standup_${message.projectId}.xlsx`,
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error("[AI SCRUM] Download error ❌:", chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            console.log("[AI SCRUM] Excel download started ✅");
            sendResponse({ success: true, downloadId });
          }
          URL.revokeObjectURL(url);
        });
      })
      .catch(error => {
        console.error("[AI SCRUM] Download Excel error ❌:", error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // async
  }

  if (message.action === "endConversation") {
    console.log("[AI SCRUM] Ending conversation for project:", message.projectId);
    
    fetch(`${BACKEND_URL}/end/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: message.projectId,
        conversation: message.conversation,
      }),
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`End conversation failed: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log("[AI SCRUM] Conversation ended ✅:", data.message);
        sendResponse({ success: true, data });
      })
      .catch(error => {
        console.error("[AI SCRUM] End conversation error ❌:", error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // async
  }

  // Legacy support for startBot (if still needed)
  if (message.action === "startBot") {
    console.log("[AI SCRUM] Starting bot for Meet URL:", message.meetUrl);

    fetch(`${BACKEND_URL}/start-bot/`, {
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
        sendResponse({ success: false, error: error.message });
      });

    return true; // async
  }

  // WebRTC forwarding (content script handles WebRTC directly now)
  if (message.action === "connectWebRTC") {
    console.log("[AI SCRUM] Forwarding connectWebRTC to active tab");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ success: false, error: "No active tab" });
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: "connectWebRTC", projectContext: message.projectContext }, sendResponse);
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
      chrome.tabs.sendMessage(tabs[0].id, { action: "startSpeaking", projectContext: message.projectContext }, sendResponse);
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
      chrome.tabs.sendMessage(tabs[0].id, { action: "stopBot", projectContext: message.projectContext }, sendResponse);
    });
    return true; // async
  }
});
