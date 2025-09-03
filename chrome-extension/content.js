// Content script loaded - AI Scrum Chrome Extension

const BACKEND_URL = "http://localhost:8000";

let remoteAudioElement = null;
let peerConnection = null;
let dataChannel = null;
let isConnected = false;

// Turn-based conversation state
let isAssistantSpeaking = false;
let isUserSpeaking = false;
let userAudioTrack = null;
let userStream = null;

// Project context state (unified with popup state)
let projectContext = {
  projectDetails: null,
  members: [],
  lastPlans: {},
  selectedProject: null,
  memberIndex: 0
};

// Popup state management (moved from popup.js)
let popupState = {
  emailSubmitted: false,
  userEmail: "",
  projectList: [],
  selectedProject: null,
  projectDetails: null,
  members: [],
  memberIndex: 0,
  lastPlans: {},
  showDownloadButton: false,
  isDownloading: false,
  emailError: ""
};



// Conversation state
let conversation = [];

// ============ POPUP FUNCTIONALITY (moved from popup.js) ============

// Create and show the popup card
function showPopupCard() {
  // Remove existing popup if any
  const existingPopup = document.getElementById('ai-scrum-popup-card');
  if (existingPopup) {
    existingPopup.remove();
  }

  const popup = document.createElement('div');
  popup.id = 'ai-scrum-popup-card';
  popup.className = 'ai-scrum-popup';
  popup.innerHTML = createPopupHTML();

  document.body.appendChild(popup);

  // Make popup draggable
  makeDraggable(popup);

  // Add event listeners
  setupPopupEventListeners(popup);

  // Automatically test email fetching when popup is shown
  setTimeout(() => {
    testGetUserEmail().then(email => {
      if (email) {
        // Update popup state with fetched email
        popupState.userEmail = email;
        // Refresh popup to show the email
        refreshPopup();
      }
    });
  }, 500); // Small delay to ensure popup is fully rendered
}

function createPopupHTML() {
  return `
    <div class="ai-scrum-popup-header" id="popup-header">
      <div class="ai-scrum-popup-title">AI Scrum Master</div>
      <div class="popup-controls">
        <button class="ai-scrum-control-btn" id="minimize-btn" title="Minimize">−</button>
        <button class="ai-scrum-close" id="close-btn" title="Close">×</button>
      </div>
      <!-- Minimized state buttons (hidden by default) -->
      <div class="minimized-controls" style="display: none;">
        <button class="minimized-btn start-btn" id="minimized-start-btn" title="Start Session" ${!canStartSession() || isConnected ? 'disabled' : ''}>▶</button>
        <button class="minimized-btn stop-btn" id="minimized-stop-btn" title="Stop Session" ${!isConnected ? 'disabled' : ''}>⏹</button>
        <button class="minimized-btn expand-btn" id="expand-btn" title="Expand">□</button>
        ${popupState.showDownloadButton ? `<button class="minimized-btn download-btn" id="minimized-download-btn" title="Download Excel">💾</button>` : ''}
      </div>
    </div>
    <div class="ai-scrum-popup-content" id="popup-content">
      <!-- Email Section -->
      ${createEmailSection()}
      
      <!-- Project Section -->
      ${createProjectSection()}
      
      <!-- Status Section (Hidden but functional) -->
      <!-- These elements are hidden from the UI but still functional for internal status tracking -->
      <div class="ai-scrum-status-display" style="display: none;">
        <span>Status: Ready</span>
        <div class="ai-scrum-indicator ready"></div>
      </div>
      
      <!-- Microphone Status (Hidden but functional) -->
      <!-- These elements are hidden from the UI but still functional for internal microphone status tracking -->
      <div class="ai-scrum-microphone-status" style="display: none;">
        <div class="mic-status">
          <span class="mic-icon">🎤</span>
          <span class="mic-text">Microphone: Ready</span>
        </div>
        <div class="meet-mute-status" id="meet-mute-status">
          <span class="meet-status-icon">🔒</span>
          <span class="meet-status-text">Google Meet: Ready</span>
        </div>
        <div class="mic-instructions">
          <small>💡 Unmute in Google Meet to use AI Scrum features</small>
        </div>
      </div>
      
      <!-- Team Members -->
      ${createTeamMembersSection()}
      
      <!-- Action Buttons -->
      <div class="ai-scrum-popup-buttons">
        <!-- Top row: Start and Stop buttons -->
        <div class="session-controls">
          <button class="ai-scrum-popup-btn start-btn" id="start-session-btn" ${!canStartSession() || isConnected ? 'disabled' : ''}>
            <span>▶</span> Start Session
          </button>
          <button class="ai-scrum-popup-btn stop-btn" id="stop-session-btn" ${!isConnected ? 'disabled' : ''}>
            <span>⏹</span> Stop Session
          </button>
        </div>
        <!-- Bottom row: Download button -->
        ${popupState.showDownloadButton ? `
        <div class="download-controls">
          <button class="ai-scrum-popup-btn download-btn" id="download-excel-btn" ${popupState.isDownloading ? 'disabled' : ''}>
            <span>💾</span> ${popupState.isDownloading ? 'Downloading...' : 'Download Excel'}
          </button>
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

function createEmailSection() {
  if (!popupState.emailSubmitted) {
    return `
      <div class="email-section">
        <div class="section-title">Enter Your Email</div>
        <form id="email-form">
          <input 
            type="email" 
            id="user-email-input" 
            placeholder="your.email@company.com"
            value="${popupState.userEmail}"
            class="email-input ${popupState.emailError ? 'error' : ''}"
            required
          />
          ${popupState.emailError ? `<div class="error-message">${popupState.emailError}</div>` : ''}
          <button type="submit" class="email-submit-btn">Get My Projects</button>
        </form>
      </div>
    `;
  } else {
    return `
      <div class="email-section">
        <div class="section-title">Your Email</div>
        <div class="email-display">
          <span class="email-chip">${popupState.userEmail}</span>
          <button class="change-email-btn" id="change-email-btn">Change</button>
        </div>
      </div>
    `;
  }
}

function createProjectSection() {
  if (!popupState.emailSubmitted) {
    return `
      <div class="project-section disabled">
        <div class="section-title">Project Selection</div>
        <div class="disabled-message">Enter your email first to load projects</div>
      </div>
    `;
  }

  if (popupState.projectList.length === 0) {
    return `
      <div class="project-section">
        <div class="section-title">Project Selection</div>
        <div class="loading-message">Loading projects...</div>
      </div>
    `;
  }

  return `
    <div class="project-section">
      <div class="section-title">Select Project (${popupState.projectList.length} available)</div>
      <select id="project-select" class="project-select">
        <option value="" ${!popupState.selectedProject ? 'selected' : ''}>Select a project</option>
        ${popupState.projectList.map(project => 
          `<option value="${project.project_id}" ${popupState.selectedProject === project.project_id ? 'selected' : ''}>${project.project_name}</option>`
        ).join('')}
      </select>
    </div>
  `;
}

function createTeamMembersSection() {
  if (!popupState.emailSubmitted || !popupState.projectDetails) {
    return `
      <div class="team-members-section disabled">
        <div class="section-title">👥 Team Members</div>
        <div class="disabled-message">${!popupState.emailSubmitted ? 'Enter email and select project' : 'Select a project to view team members'}</div>
      </div>
    `;
  }

  return `
    <div class="team-members-section">
      <div class="section-title">👥 Team Members</div>
      <div class="members-list">
        ${popupState.members.map((member, index) => `
          <div class="member-item ${index === popupState.memberIndex ? 'current' : ''}">
            <div class="member-avatar">${member.name.charAt(0)}</div>
            <div class="member-info">
              <div class="member-name">${member.name} ${index === popupState.memberIndex ? '(Current)' : ''}</div>
              <div class="member-role">${member.role} • ${member.employee_id}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function canStartSession() {
  return popupState.emailSubmitted && popupState.selectedProject && popupState.members.length > 0;
}

// Make popup draggable
function makeDraggable(popup) {
  const header = popup.querySelector('#popup-header');
  let isDragging = false;
  let currentX = 0;
  let currentY = 0;
  let initialX = 0;
  let initialY = 0;
  let xOffset = 0;
  let yOffset = 0;

  header.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', dragMove);
  document.addEventListener('mouseup', dragEnd);

  function dragStart(e) {
    if (e.target.closest('.popup-controls')) return; // Don't drag when clicking controls

    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;

    if (e.target === header || header.contains(e.target)) {
      isDragging = true;
      header.style.cursor = 'grabbing';
      popup.style.transition = 'none'; // Disable transition during drag
    }
  }

  function dragMove(e) {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      xOffset = currentX;
      yOffset = currentY;

      popup.style.transform = `translate(${currentX}px, ${currentY}px)`;
      popup.style.position = 'fixed'; // Ensure position is fixed for transform
    }
  }

  function dragEnd() {
    if (isDragging) {
      initialX = currentX;
      initialY = currentY;
      isDragging = false;
      header.style.cursor = 'grab';
      popup.style.transition = 'transform 0.2s ease-out'; // Re-enable transition
    }
  }
}

// Refresh popup UI
function refreshPopup() {
  const popup = document.getElementById('ai-scrum-popup-card');
  if (popup) {
    popup.innerHTML = createPopupHTML();
    makeDraggable(popup);  // Re-enable drag functionality after HTML refresh
    setupPopupEventListeners(popup);
  }
}

// Load external CSS file for popup styles
function loadPopupStyles() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = chrome.runtime.getURL('content.css');
  document.head.appendChild(link);
}

// Build dynamic system message for AI
function buildDynamicSystemMessage(project, membersList, lastPlansMap = {}) {
  const memberNames = membersList
    .map((m) => `${m.name} (${m.role})`)
    .join(", ");

  const perMemberNotes = membersList
    .map((m) => {
      const last = lastPlansMap[m.employee_id];
      if (!last)
        return `${m.name}: No previous standup data available - this will be their first standup. Ask about: 1) What they accomplished yesterday, 2) Today's plans, 3) Any blockers from yesterday that might still affect them, 4) Any current blockers for today.`;

      const dateStr = last.Date
        ? new Date(last.Date).toLocaleDateString()
        : "previous date";

      const completed = last["Completed Yesterday"] || "Not specified";
      const planned = last["Plan Today"] || "Not specified";
      const blockers = last["Blockers"] || "None";

      return `${m.name} - Last standup on ${dateStr}: They completed "${completed}", planned "${planned}", and had blockers: "${blockers}".`;
    })
    .join("\n");



  return `You are a friendly, warm, and enthusiastic standup facilitator for "${project.project_name}" - think of yourself as an Alexa-like assistant with lots of personality! Your goal is to create a comfortable, supportive environment while gathering standup updates.

Team members: ${memberNames}

Previous standup context:
${perMemberNotes}

PERSONALITY & TONE - BE FRIENDLY AND NATURAL:
- Be warm, friendly, and genuinely interested in their work
- Use casual, conversational language that sounds natural
- Occasionally use expressive reactions like "Oh!","Aww","Huhh Hmm","That's great!", "Nice!", but don't overdo it
- Include natural conversational fillers like "So...", "Well...", "Let's see..."
- Show genuine interest: "That sounds interesting!", "I see what you mean!"
- Be supportive when they mention challenges: "That does sound tricky!"
- Celebrate their successes naturally: "That's great work!", "Well done!"
- Keep the mood light, positive, and professional but friendly
- Sound like a helpful colleague who's genuinely interested in the project

CONVERSATION FLOW RULES:
1. START IMMEDIATELY with a warm greeting to the whole team
2. For each member, work through ALL three questions before moving to the next person:
   - What they completed yesterday (reference previous work if available)
   - What they're planning today
   - Any blockers they're facing
3. ONLY move to the next member after getting all three answers from current member
4. Use transition phrases like "Awesome, thanks [Name]! Let me move to [Next Name] now..."
5. Celebrate completions and offer encouragement for plans

HANDLING PREVIOUS STANDUP DATA - CRITICAL INSTRUCTIONS:
- ALWAYS use the EXACT text from the previous standup data
- If they have previous data, reference it naturally: "Hi [Name]! I see you were planning to work on '[EXACT previous plan text]' yesterday - how did that go? What were you able to complete?"
- If they had blockers, ask with concern: "I also remember you mentioned '[EXACT previous blocker text]' - did you manage to resolve that?"
- If no previous data: "Hi [Name]! Let's start with what you accomplished yesterday"
- For members with no previous data, ALWAYS ask these questions clearly:
  1. "What did you accomplish yesterday?"
  2. "That sounds good! What are you planning to work on today?"
  3. "Did you have any blockers yesterday that might still be affecting you?"
  4. "And do you have any current blockers for today's work?"
- NEVER make up or assume tasks - only use the exact text provided
- Be encouraging naturally: "Good work on that!", "Nice progress!", "That sounds challenging but you handled it well!"

HANDLING OFF-TOPIC RESPONSES:
- If someone talks about unrelated topics, gently redirect: "That's interesting! But let's focus on your work updates for the standup. So about [question]..."
- Stay friendly while redirecting: "I appreciate you sharing that! Now, back to your standup - can you tell me about [specific question]?"
- Don't be harsh, just guide them back smoothly with natural transitions

EXAMPLE OPENING:
"Hello everyone! I'm excited to be here for your standup today. Let's begin, ${membersList[0]?.name}! ${lastPlansMap[membersList[0]?.employee_id]?.["Plan Today"] ? `I see yesterday you planned to ${lastPlansMap[membersList[0]?.employee_id]["Plan Today"].toLowerCase()}. How did that go? What were you able to complete?` : "What did you work on yesterday?"}"

MEMBER TRANSITIONS:
When moving to next member, say naturally: "Thanks [current name]! Great to hear about your progress. Now let me move to the next member. [next name], hello! [Previous task reference if available] So [next name], did you complete those items yesterday?"

CRITICAL RULES: 
- Complete ALL questions for one member before moving to next
- ONLY use exact text from previous standup data - NEVER hallucinate or make up tasks
- Use natural conversational style: "Yesterday you planned to [task] - how did that go?"
- Keep it natural, friendly, and professional
- Don't rush - let them fully answer each question and respond appropriately
- Start the conversation immediately upon session start
- Always reference their previous plan directly when available
- Show genuine interest in their work and challenges
- Use natural speech patterns to sound conversational and human`;
}

// Audio processing and monitoring
let audioContext = null;
let analyser = null;
let audioProcessor = null;
let noiseSuppression = null;
let volumeLevel = 0;

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
    // Remote audio element created
  }
}

// Enhanced microphone setup with advanced noise suppression
async function setupMicrophone() {
  try {
    // Allow microphone access regardless of Google Meet mute state

    // Enhanced microphone settings optimized for headphones and noise suppression
    userStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1,
        latency: 0.01,
        volume: 0.7, // Reduced volume to prevent feedback with headphones
        // Chrome-specific enhanced settings for headphones
        googEchoCancellation: true,
        googAutoGainControl: true,
        googNoiseSuppression: true,
        googHighpassFilter: true,
        googEchoCancellation2: true,
        googDAEchoCancellation: true,
        googTypingNoiseDetection: true,
        googBeamforming: true,
        googArrayGeometry: true,
        googAudioMirroring: false,
        // Additional headphone-specific settings
        googNoiseSuppression2: true,
        googEchoCancellation3: true,
        googAecRefDelay: 0.01,
        googAecExtendedFilter: true,
      },
    });

    userAudioTrack = userStream.getAudioTracks()[0];

    // Enhanced audio processing pipeline for noise suppression
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 48000,
      latencyHint: "interactive",
    });

    const source = audioContext.createMediaStreamSource(userStream);

    // Create analyser for volume monitoring with optimized settings
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; // Higher resolution for better detection
    analyser.smoothingTimeConstant = 0.9; // More aggressive smoothing
    analyser.minDecibels = -80; // Better sensitivity
    analyser.maxDecibels = -20;

    // Multi-stage audio processing for noise suppression
    let audioChain = source;

    // 1. High-pass filter to remove low-frequency noise
    if (audioContext.createBiquadFilter) {
      const highPassFilter = audioContext.createBiquadFilter();
      highPassFilter.type = "highpass";
      highPassFilter.frequency.setValueAtTime(100, audioContext.currentTime);
      highPassFilter.Q.setValueAtTime(0.7, audioContext.currentTime);
      audioChain.connect(highPassFilter);
      audioChain = highPassFilter;
    }

    // 2. Dynamic range compressor for consistent levels
    if (audioContext.createDynamicsCompressor) {
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-30, audioContext.currentTime); // More aggressive
      compressor.knee.setValueAtTime(40, audioContext.currentTime);
      compressor.ratio.setValueAtTime(8, audioContext.currentTime);
      compressor.attack.setValueAtTime(0.001, audioContext.currentTime); // Faster attack
      compressor.release.setValueAtTime(0.1, audioContext.currentTime); // Faster release
      audioChain.connect(compressor);
      audioChain = compressor;
    }

    // 3. Noise gate to prevent background noise
    const noiseGate = audioContext.createGain();
    noiseGate.gain.setValueAtTime(0.2, audioContext.currentTime); // Lower threshold
    noiseSuppression = noiseGate;
    audioChain.connect(noiseGate);
    audioChain = noiseGate;

    // Connect to analyser for monitoring
    audioChain.connect(analyser);

    // Start volume monitoring
    monitorAudioLevels();

    // Start periodic popup updates to ensure UI stays responsive
    startPeriodicPopupUpdates();

    // Start monitoring Google Meet mute state
    startMuteMonitoring();

    return true;
  } catch (error) {
    throw error;
  }
}

// Monitor audio levels for speech detection (no volume display needed)
function monitorAudioLevels() {
  if (!analyser) {
    return;
  }

  const bufferLength = analyser.frequencyBinCount;
  const frequencyData = new Uint8Array(bufferLength);

  let speechDetected = false;

  const checkAudioLevel = () => {
    if (!analyser) return;

    analyser.getByteTimeDomainData(frequencyData);

    // Simple RMS calculation for speech detection
    let rms = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      const sample = (frequencyData[i] - 128) / 128;
      rms += sample * sample;
    }
    rms = Math.sqrt(rms / frequencyData.length);

    // Threshold-based speech detection
    const threshold = isAssistantSpeaking ? 0.02 : 0.05;
    const newVolumeLevel = rms > threshold ? Math.min(rms * 200, 100) : 0;
    
    // Update volume level for internal use
    if (Math.abs(newVolumeLevel - volumeLevel) > 1) {
      volumeLevel = newVolumeLevel;
      
      // Update speech detection state
      if (volumeLevel > 5 && !speechDetected) {
        speechDetected = true;
      } else if (volumeLevel < 2 && speechDetected) {
        speechDetected = false;
      }
    }

    // Continue monitoring
    requestAnimationFrame(checkAudioLevel);
  };

  checkAudioLevel();
}

// Enhanced mute state detection - ONLY for microphone/audio, not video
function isGoogleMeetMuted() {
  // Method 1: Check microphone mute button state specifically
  const micMuteButton = document.querySelector('[aria-label*="microphone"], [aria-label*="Microphone"], [aria-label*="mute microphone"], [aria-label*="Mute microphone"]');
  if (micMuteButton) {
    const ariaLabel = micMuteButton.getAttribute('aria-label') || '';
    // Only return true if it's specifically about microphone unmuting
    if (ariaLabel.includes('unmute') && (ariaLabel.includes('microphone') || ariaLabel.includes('mic'))) {
      return true; // Microphone is muted
    }
    if (ariaLabel.includes('Turn on microphone') || ariaLabel.includes('Enable microphone')) {
      return true; // Microphone is muted
    }
  }
  
  // Method 2: Check for microphone-specific muted indicators
  const micMutedSelectors = [
    '[data-mic-muted="true"]',
    '[data-audio-muted="true"]',
    '.mic-muted',
    '.audio-muted',
    '.microphone-off'
  ];
  
  for (const selector of micMutedSelectors) {
    if (document.querySelector(selector)) {
      return true;
    }
  }
  
  // Method 3: Look for microphone-specific button text
  const micMuteTexts = ['unmute microphone', 'turn on microphone', 'enable microphone', 'unmute mic', 'turn on mic'];
  const allButtons = document.querySelectorAll('button');
  
  for (const button of allButtons) {
    const buttonText = button.textContent?.toLowerCase() || '';
    if (micMuteTexts.some(text => buttonText.includes(text))) {
      return true;
    }
  }
  
  // Method 4: Check for video mute buttons to ensure we're not confusing them
  const videoMuteButton = document.querySelector('[aria-label*="camera"], [aria-label*="Camera"], [aria-label*="video"], [aria-label*="Video"]');
  if (videoMuteButton) {
    const videoAriaLabel = videoMuteButton.getAttribute('aria-label') || '';
    // If we find a video mute button, make sure we're not accidentally detecting it as audio mute
    if (videoAriaLabel.includes('unmute') && (videoAriaLabel.includes('camera') || videoAriaLabel.includes('video'))) {
      // This is video mute, not audio mute - ignore it
    }
  }
  
  return false;
}

// Function to stop microphone access when Meet is muted
function stopMicrophoneAccess() {
  if (userAudioTrack && userAudioTrack.readyState === "live") {
    userAudioTrack.enabled = false;
    
    // Update UI to show microphone is disabled
    updatePopupMicrophoneStatus('Disabled (Meet Muted)');
  }
}

// Function to resume microphone access when Meet is unmuted
function resumeMicrophoneAccess() {
  if (userAudioTrack && userAudioTrack.readyState === "live") {
    userAudioTrack.enabled = true;
    
    // Update UI to show microphone is ready
    updatePopupMicrophoneStatus('Ready');
  }
}

// Add a mute state monitor
function startMuteStateMonitoring() {
  // Monitor for changes in Google Meet's mute state
  const observer = new MutationObserver(() => {
    const isMuted = isGoogleMeetMuted();
    
    if (isMuted && userAudioTrack && userAudioTrack.enabled) {
      stopMicrophoneAccess();
    } else if (!isMuted && userAudioTrack && !userAudioTrack.enabled && isConnected) {
      resumeMicrophoneAccess();
    }
  });

  // Observe the entire document for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label', 'data-is-muted', 'class']
  });

  return observer;
}

// Start mute monitoring when session begins
function startMuteMonitoring() {
  const muteObserver = startMuteStateMonitoring();
  // Store observer reference for cleanup
  window.aiScrumMuteObserver = muteObserver;
}

// Clean up observer when stopping
function stopMuteMonitoring() {
  if (window.aiScrumMuteObserver) {
    window.aiScrumMuteObserver.disconnect();
    window.aiScrumMuteObserver = null;
  }
}

// Update the updatePopupMicrophoneStatus function to handle new statuses
function updatePopupMicrophoneStatus(status) {
  const popup = document.getElementById('ai-scrum-popup-card');
  if (!popup) return;

  const micText = popup.querySelector('.mic-text');
  const micIcon = popup.querySelector('.mic-icon');

  if (micText) {
    micText.textContent = `Microphone: ${status}`;
  }

  if (micIcon) {
    switch (status.toLowerCase()) {
      case 'disabled (meet muted)':
        micIcon.textContent = '🚫';
        break;
      case 'muted':
        micIcon.textContent = '🔇';
        break;
      case 'listening':
        micIcon.textContent = '🎤';
        break;
      case 'ready':
        micIcon.textContent = '🎤';
        break;
      default:
        micIcon.textContent = '🎤';
    }
  }
}

// Function to update Google Meet mute status display
function updateMeetMuteStatus() {
  const popup = document.getElementById('ai-scrum-popup-card');
  if (!popup) return;

  const meetStatusIcon = popup.querySelector('.meet-status-icon');
  const meetStatusText = popup.querySelector('.meet-status-text');

  if (meetStatusIcon && meetStatusText) {
    if (isGoogleMeetMuted()) {
      meetStatusIcon.textContent = '🔇';
      meetStatusText.textContent = 'Google Meet: Muted';
      meetStatusText.style.color = '#d93025'; // Red color for muted
    } else {
      meetStatusIcon.textContent = '🎤';
      meetStatusText.textContent = 'Google Meet: Ready';
      meetStatusText.style.color = '#137333'; // Green color for ready
    }
  }
}

// Setup popup event listeners
function setupPopupEventListeners(popup) {
  const closeBtn = popup.querySelector('#close-btn');
  const minimizeBtn = popup.querySelector('#minimize-btn');
  const startBtn = popup.querySelector('#start-session-btn');
  const stopBtn = popup.querySelector('#stop-session-btn');

  // Email form
  const emailForm = popup.querySelector('#email-form');
  const changeEmailBtn = popup.querySelector('#change-email-btn');
  const projectSelect = popup.querySelector('#project-select');
  const downloadBtn = popup.querySelector('#download-excel-btn');

  let isMinimized = false;

  // Close button
  closeBtn.addEventListener('click', () => {
    popup.remove();
  });

  // Email form submission
  if (emailForm) {
    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = popup.querySelector('#user-email-input');
      const email = emailInput.value.trim();
      
      if (!email) {
        popupState.emailError = "Please enter your email";
        refreshPopup();
        return;
      }

      try {
        popupState.emailError = "";
        // Send request through background script
        const response = await sendMessageToBackground('fetchProjects', { email });
        if (response.success) {
          popupState.userEmail = email;
          popupState.emailSubmitted = true;
          popupState.projectList = response.data;

          refreshPopup();
        } else {
          throw new Error(response.error || 'Failed to fetch projects');
        }
      } catch (error) {
        popupState.emailError = error.message || "Failed to fetch projects. Please try again.";
        refreshPopup();
      }
    });
  }

  // Change email button
  if (changeEmailBtn) {
    changeEmailBtn.addEventListener('click', () => {
      popupState.emailSubmitted = false;
      popupState.userEmail = "";
      popupState.emailError = "";
      popupState.projectList = [];
      popupState.selectedProject = null;
      popupState.projectDetails = null;
      popupState.members = [];
      popupState.lastPlans = {};
      popupState.showDownloadButton = false;
      popupState.memberIndex = 0;
      refreshPopup();
    });
  }

  // Project selection
  if (projectSelect) {
    projectSelect.addEventListener('change', async (e) => {
      const projectId = e.target.value;
      if (!projectId) return;

      popupState.selectedProject = projectId;
      popupState.memberIndex = 0;
      popupState.showDownloadButton = false;

      try {
        // Send request through background script
        const response = await sendMessageToBackground('fetchProjectDetails', { projectId });
        if (response.success) {
          const projectDetails = response.data;
          popupState.projectDetails = projectDetails;
          
          const members = (projectDetails.employees || []).map((e) => ({
            id: e.id,
            name: e.employee_name,
            employee_id: e.employee_id,
            role: e.role,
          }));
          popupState.members = members;

          // Fetch previous standup data for all members
          const lastPlansResponse = await sendMessageToBackground('fetchAllLastStandups', { members });
          if (lastPlansResponse.success) {
            popupState.lastPlans = lastPlansResponse.data;
          }


          refreshPopup();
        } else {
          throw new Error(response.error || 'Failed to fetch project details');
        }
      } catch (error) {
        console.error("Error fetching project details:", error);
        // Reset project selection on error
        popupState.selectedProject = null;
        popupState.projectDetails = null;
        popupState.members = [];
        refreshPopup();
      }
    });
  }

  // Download Excel button
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      if (!popupState.selectedProject) return;
      
      popupState.isDownloading = true;
      refreshPopup();

      try {
        const response = await sendMessageToBackground('downloadExcel', { projectId: popupState.selectedProject });
        if (response.success) {
  
        } else {
          throw new Error(response.error || 'Download failed');
        }
      } catch (error) {
        console.error("❌ Download error:", error);
        alert("Failed to download Excel file. Please try again.");
      } finally {
        popupState.isDownloading = false;
        refreshPopup();
      }
    });
  }

  // Minimize/Maximize button
  minimizeBtn.addEventListener('click', () => {
    if (isMinimized) {
      // Expand
      popup.classList.remove('minimized');
      minimizeBtn.innerHTML = '−';
      minimizeBtn.title = 'Minimize';
      popup.querySelector('.popup-controls').style.display = 'flex';
      popup.querySelector('.minimized-controls').style.display = 'none';
      isMinimized = false;
    } else {
      // Minimize
      popup.classList.add('minimized');
      minimizeBtn.innerHTML = '□';
      minimizeBtn.title = 'Expand';
      popup.querySelector('.popup-controls').style.display = 'none';
      popup.querySelector('.minimized-controls').style.display = 'flex';
      isMinimized = true;
    }
  });

  // Start session
  startBtn.addEventListener('click', () => {
    if (!canStartSession()) {
      alert("Please enter your email and select a project with team members first.");
      return;
    }

    if (isConnected) {
      alert("Session is already active. Please stop the current session first.");
      return;
    }




    
    const statusDisplay = popup.querySelector('.ai-scrum-status-display span');
    const indicator = popup.querySelector('.ai-scrum-indicator');
    if (statusDisplay) statusDisplay.textContent = 'Status: Connecting...';
    if (indicator) indicator.className = 'ai-scrum-indicator connecting';

    // Reset member index when starting new session
    popupState.memberIndex = 0;
    popupState.showDownloadButton = false;

    // Update project context from popup state
    projectContext = {
      projectDetails: popupState.projectDetails,
      members: popupState.members,
      lastPlans: popupState.lastPlans,
      selectedProject: popupState.selectedProject,
      memberIndex: 0
    };

    // First establish WebRTC connection with project context
    connectToAIBot()
      .then(() => {
        const statusDisplay = popup.querySelector('.ai-scrum-status-display span');
        const indicator = popup.querySelector('.ai-scrum-indicator');
        if (statusDisplay) statusDisplay.textContent = 'Status: Connected';
        if (indicator) indicator.className = 'ai-scrum-indicator ready';
        
        // Wait for data channel to be ready before starting AI conversation
        let attempts = 0;
        const maxAttempts = 20; // 10 seconds maximum wait
        
        const checkDataChannelReady = () => {
          if (isConnected && dataChannel && dataChannel.readyState === "open") {
            // Now trigger AI to speak with project context
            startAIConversation();
            if (statusDisplay) statusDisplay.textContent = 'Status: Active';
            if (indicator) indicator.className = 'ai-scrum-indicator active';
            
            // Update button states after successful connection
            refreshPopup();
          } else if (attempts < maxAttempts) {
            attempts++;
            // Check again in 500ms
            setTimeout(checkDataChannelReady, 500);
          } else {
            if (statusDisplay) statusDisplay.textContent = 'Status: Connection Timeout';
            if (indicator) indicator.className = 'ai-scrum-indicator error';
            
            // Reset connection state on failure
            isConnected = false;
            refreshPopup();
          }
        };
        
        // Start checking for data channel readiness
        setTimeout(checkDataChannelReady, 100);
      })
      .catch((error) => {
        console.error('[Content] WebRTC connection failed:', error);
        const statusDisplay = popup.querySelector('.ai-scrum-status-display span');
        const indicator = popup.querySelector('.ai-scrum-indicator');
        if (statusDisplay) statusDisplay.textContent = 'Status: Connection Failed';
        if (indicator) indicator.className = 'ai-scrum-indicator error';
        
        // Reset connection state on failure
        isConnected = false;
        refreshPopup();
      });
  });

  // Stop session
  stopBtn.addEventListener('click', async () => {
    if (!isConnected) {
      alert("No active session to stop.");
      return;
    }



    // Update status
    const statusDisplay = popup.querySelector('.ai-scrum-status-display span');
    const indicator = popup.querySelector('.ai-scrum-indicator');
    if (statusDisplay) statusDisplay.textContent = 'Status: Saving...';
    if (indicator) indicator.className = 'ai-scrum-indicator connecting';

    // Send end conversation to backend to save standup data (like VoiceAssistant.jsx)
    try {
      if (popupState.selectedProject && conversation.length > 0) {
        const response = await sendMessageToBackground('endConversation', {
          projectId: popupState.selectedProject,
          conversation: conversation.filter((msg) => msg.role !== "system")
        });

        if (response.success) {
          popupState.showDownloadButton = true;
          if (statusDisplay) statusDisplay.textContent = 'Status: Complete';
          if (indicator) indicator.className = 'ai-scrum-indicator ready';
        } else {
          throw new Error(response.error || 'Failed to save conversation');
        }
      } else {
        if (statusDisplay) statusDisplay.textContent = 'Status: No Data';
        if (indicator) indicator.className = 'ai-scrum-indicator ready';
      }
    } catch (error) {
      if (statusDisplay) statusDisplay.textContent = 'Status: Save Failed';
      if (indicator) indicator.className = 'ai-scrum-indicator error';
      alert("Failed to save standup data. Please try again.");
    }

    // Stop audio monitoring and cleanup
    stopAudioProgressMonitoring();
    
    // Stop mute state monitoring
    stopMuteMonitoring();
    
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

    // Close audio context
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    
    // Reset connection state
    dataChannel = null;
    isConnected = false;
    

    
    // Clear conversation after saving
    conversation = [];

    // Update final status and refresh popup to show new button states
    const finalStatusDisplay = popup.querySelector('.ai-scrum-status-display span');
    const finalIndicator = popup.querySelector('.ai-scrum-indicator');
    if (popupState.showDownloadButton) {
      if (finalStatusDisplay) finalStatusDisplay.textContent = 'Status: Ready';
      if (finalIndicator) finalIndicator.className = 'ai-scrum-indicator ready';
    }
    
    // Refresh popup to show download button and correct button states
    refreshPopup();
  });

  // Setup minimized state buttons
  const minimizedStartBtn = popup.querySelector('#minimized-start-btn');
  const minimizedStopBtn = popup.querySelector('#minimized-stop-btn');
  const expandBtn = popup.querySelector('#expand-btn');

  if (minimizedStartBtn) {
    minimizedStartBtn.addEventListener('click', () => {
      startBtn.click(); // Reuse main start button logic
    });
  }

  if (minimizedStopBtn) {
    minimizedStopBtn.addEventListener('click', () => {
      stopBtn.click(); // Reuse main stop button logic
    });
  }

  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      popup.classList.remove('minimized');
      minimizeBtn.innerHTML = '−';
      minimizeBtn.title = 'Minimize';
      popup.querySelector('.popup-controls').style.display = 'flex';
      popup.querySelector('.minimized-controls').style.display = 'none';
      isMinimized = false;
    });
  }
}

// Helper function to send messages to background script and get response
function sendMessageToBackground(action, data) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...data }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}



// Function to update microphone status in popup (hidden but functional)
function updateMicrophoneStatus(status) {
  const popup = document.getElementById('ai-scrum-popup-card');
  if (!popup) {
    return;
  }

  const micText = popup.querySelector('.mic-text');
  const micIcon = popup.querySelector('.mic-icon');

  // Update microphone status even when hidden (for functionality)
  if (micText) {
    micText.textContent = `Microphone: ${status}`;
  }

  if (micIcon) {
    switch (status.toLowerCase()) {
      case 'muted':
        micIcon.textContent = '🔇';
        break;
      case 'listening':
        micIcon.textContent = '🎤';
        break;
      case 'speaking':
        micIcon.textContent = '🗣️';
        break;
      default:
        micIcon.textContent = '🎤';
    }
  }
}

// Start periodic popup updates to ensure UI stays responsive
function startPeriodicPopupUpdates() {
  // Update popup every 200ms for smooth volume bar animation without excessive CPU usage
  setInterval(() => {
    if (isConnected) {
      let status = 'Ready';
      if (isAssistantSpeaking) {
        status = 'Muted';
      } else if (isUserSpeaking) {
        status = 'Listening';
      }
      updatePopupMicrophoneStatus(status);
    }
    // Always update Google Meet mute status
    updateMeetMuteStatus();
  }, 200);
}

// Enhanced mute microphone function
function muteMicrophone() {
  if (userAudioTrack && userAudioTrack.readyState === "live") {
    userAudioTrack.enabled = false;

    // Apply noise gate to minimize headphone bleed without suspending context
    if (noiseSuppression && audioContext) {
      noiseSuppression.gain.setValueAtTime(0.01, audioContext.currentTime);
    }

    // Update popup status
    updatePopupMicrophoneStatus('Muted');
  }
}

// Enhanced unmute microphone function
function unmuteMicrophone() {
  if (userAudioTrack && userAudioTrack.readyState === "live") {
    userAudioTrack.enabled = true;

    // Restore normal noise gate level
    if (noiseSuppression && audioContext) {
      noiseSuppression.gain.setValueAtTime(0.2, audioContext.currentTime);
    }

    // Update popup status
    updatePopupMicrophoneStatus('Ready');
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Handle WebRTC connect request from background/popup
  if (message.action === "connectWebRTC") {
    // Store project context if provided
    if (message.projectContext) {
      projectContext = { ...message.projectContext };
    }
    
    connectToAIBot()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    return true; // async response
  }

  // Handle start speaking request
  if (message.action === "startSpeaking") {
    // Store project context if provided
    if (message.projectContext) {
      projectContext = { ...message.projectContext };
    }

    if (!isConnected || !dataChannel || dataChannel.readyState !== "open") {
      // Wait a bit for data channel to open if connection is in progress
      setTimeout(() => {
        if (isConnected && dataChannel && dataChannel.readyState === "open") {
          startAIConversation();
          sendResponse({ success: true });
        } else {
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
    // Send final conversation data to backend if we have project context
    if (message.projectContext?.selectedProject && conversation.length > 0) {
      try {
        fetch("http://localhost:8000/end/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: message.projectContext.selectedProject,
            conversation: conversation.filter((msg) => msg.role !== "system"),
          }),
        }).then(response => {
        }).catch(error => {
        });
      } catch (error) {
      }
    }
    
    // Stop audio monitoring
    stopAudioProgressMonitoring();
    
    // Stop mute state monitoring
    stopMuteMonitoring();
    
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

    // Close audio context
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    
    // Reset state
    dataChannel = null;
    isConnected = false;
    

    
    conversation = [];
    projectContext = {
      projectDetails: null,
      members: [],
      lastPlans: {},
      selectedProject: null,
      memberIndex: 0
    };
    
    sendResponse && sendResponse({ success: true });
    return;
  }

  if (message.action === "audioReceived") {
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
  // Handle AI events

  // Handle different AI events
  switch (event.type) {
    case "session.created":
    case "session.updated":
      // Session configured
      break;

    case "response.created":
      // AI starting response
      break;

    case "response.done":
      // AI response complete
      break;

    case "response.audio_transcript.done":
      if (event.transcript) {
        // Display AI response in popup
        updatePopupWithAIResponse(event.transcript);
      }
      break;

    case "input_audio_buffer.speech_started":
      console.log("👂 User started speaking");
      break;

    case "input_audio_buffer.speech_stopped":
      console.log("🛑 User finished speaking");
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
      // ICE candidate found
    };

    // Create data channel
    dataChannel = peerConnection.createDataChannel("oai-events", {
      ordered: true,
      protocol: "json",
    });
    setupDataChannel();

    // Setup enhanced microphone with headphone optimization
    await setupMicrophone();
    peerConnection.addTrack(userAudioTrack, userStream);

    // Remote audio
    peerConnection.ontrack = (event) => {
      createRemoteAudioElement();
      if (remoteAudioElement) {
        remoteAudioElement.srcObject = event.streams[0];
        
        // Enhanced event listeners for audio completion
        remoteAudioElement.onplaying = () => {
          isAssistantSpeaking = true;
          audioState.isAudioPlaying = true;
          audioState.audioEndedNaturally = false; // Reset flag
          startAudioProgressMonitoring(); // Start monitoring progress
          muteMicrophone(); // Ensure mic is muted when audio starts
        };

        remoteAudioElement.onended = () => {
          audioState.isAudioPlaying = false;
          audioState.audioEndedNaturally = true; // Set flag
          stopAudioProgressMonitoring(); // Stop monitoring
          checkAndUnmuteMicrophone("audio_track_ended", audioState.currentResponseId);
        };

        remoteAudioElement.onpause = () => {
          audioState.isAudioPlaying = false;
          stopAudioProgressMonitoring();
          checkAndUnmuteMicrophone("audio_paused", audioState.currentResponseId);
        };

        // Additional safety check for when audio stops
        remoteAudioElement.addEventListener("loadstart", () => {
          audioState.isAudioPlaying = true;
          audioState.audioEndedNaturally = false; // Reset on new load
          startAudioProgressMonitoring(); // Start monitoring
          isAssistantSpeaking = true;
          muteMicrophone();
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
    // Note: isConnected will be set to true when data channel opens
  } catch (error) {
    throw error;
  }
}

function setupDataChannel() {
  dataChannel.addEventListener("open", () => {
    isConnected = true; // Set connected flag when data channel is actually open
    
    // Build AI instructions based on project context
    let instructions = "You are a friendly AI assistant helping with Google Meet standup meetings.";
    
    if (projectContext.projectDetails && projectContext.members.length > 0) {
      // Use the dynamic system message from integrated function
      instructions = buildDynamicSystemMessage(
        projectContext.projectDetails,
        projectContext.members,
        projectContext.lastPlans
      );
    } else {
    }

    const sessionUpdate = {
      type: "session.update",
      session: {
        voice: "alloy",
        instructions: instructions,
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
    }
  });

  dataChannel.addEventListener("error", (error) => {
  });
}

function sendData(data) {
  if (dataChannel && dataChannel.readyState === "open") {
    try {
      const jsonData = JSON.stringify(data);
      dataChannel.send(jsonData);
    } catch (error) {
    }
  }
}

// Start AI conversation with welcome message
function startAIConversation() {
  
  let welcomeInstructions = "Hello everyone! I'm your AI Scrum Master and I'm here to help facilitate your standup meeting today. I'm looking forward to hearing about the work you've been doing. Are you ready to begin?";
  
  // If we have project context, start with personalized greeting
  if (projectContext.projectDetails && projectContext.members.length > 0) {
    const firstMember = projectContext.members[0];
    const lastForFirst = projectContext.lastPlans[firstMember?.employee_id];

    const openingPrompt = lastForFirst?.["Plan Today"]
      ? `Hello everyone! I'm excited to be here for your standup today. Let's begin, ${firstMember.name}! I see yesterday you planned to ${lastForFirst["Plan Today"].toLowerCase()}. How did that go? What were you able to complete?`
      : `Hello everyone! I'm excited to be here for your standup today. Let's begin, ${firstMember.name}! What did you work on yesterday?`;

    welcomeInstructions = `Say exactly: "${openingPrompt}" - use this natural and friendly greeting format.`;
  } else {
  }

  const welcomeMessage = {
    type: "response.create",
    response: {
      modalities: ["audio", "text"],
      instructions: welcomeInstructions,
    },
  };
  
  sendData(welcomeMessage);
}

// Audio completion checking
function checkAndUnmuteMicrophone(eventType, responseId) {

  // For audio track ended event, unmute immediately if other conditions are met
  if (eventType === "audio_track_ended" && audioState.audioEndedNaturally) {
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
      return;
    }

    isAssistantSpeaking = false;
    unmuteMicrophone();
    resetAudioState();
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
    if (!remoteAudio) return;

    const currentTime = remoteAudio.currentTime;
    const duration = remoteAudio.duration;
    const isPlaying = !remoteAudio.paused && !remoteAudio.ended;

    // Check if audio time is advancing
    const timeAdvancing = currentTime > audioState.lastAudioTime;
    audioState.lastAudioTime = currentTime;

    // If audio stopped advancing for more than 1 second, consider it finished
    if (!timeAdvancing && isPlaying && currentTime > 0) {
      audioState.isAudioPlaying = false;
      stopAudioProgressMonitoring();
      checkAndUnmuteMicrophone("audio_progress_stopped", audioState.currentResponseId);
    }
  }, 500); // Check every 500ms
}

function stopAudioProgressMonitoring() {
  if (audioState.audioProgressCheckInterval) {
    clearInterval(audioState.audioProgressCheckInterval);
    audioState.audioProgressCheckInterval = null;
  }
}

function handleServerEvent(event) {
  
  try {
    // Handle session events
    if (event.type === "session.created" || event.type === "session.updated") {
      return;
    }

    // Handle response management
    if (event.type === "response.created") {
      
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
      audioState.isResponseComplete = true;
      checkAndUnmuteMicrophone("response.done", event.response?.id);
      return;
    }

    // Handle audio buffer events
    if (event.type === "response.audio.delta") {
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
      audioState.isAudioPlaying = false;
      audioState.isAudioStreamComplete = true;
      stopAudioProgressMonitoring();
      checkAndUnmuteMicrophone("response.audio.done", event.response_id);
      return;
    }

    // Handle output audio buffer events
    if (event.type === "response.output_audio_buffer.started") {
      isAssistantSpeaking = true;
      muteMicrophone();
      audioState.isAudioPlaying = true;
      audioState.audioEndedNaturally = false;
      startAudioProgressMonitoring();
      return;
    }

    if (event.type === "output_audio_buffer.stopped") {
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
      updatePopupMicrophoneStatus('Listening');
      return;
    }

    if (event.type === "input_audio_buffer.speech_stopped") {
      console.log("🛑 User finished speaking");
      isUserSpeaking = false;
      updatePopupMicrophoneStatus('Ready');
      return;
    }

    // Handle input audio transcription events
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      if (event.transcript && event.transcript.trim()) {
        console.log("📝 User transcript:", event.transcript);
        updatePopupWithUserMessage(event.transcript);
        
        // Add to conversation history
        const userMsg = { role: "user", content: event.transcript.trim() };
        conversation.push(userMsg);
      }
      return;
    }

    // Handle assistant transcript events
    if (event.type === "response.audio_transcript.delta") {
      if (!isAssistantSpeaking) {
        isAssistantSpeaking = true;
        muteMicrophone();
      }
      return;
    }

    if (event.type === "response.audio_transcript.done") {
      console.log("🗣️ AI transcript:", event.transcript);
      audioState.isTranscriptComplete = true;
      
      if (event.transcript && event.transcript.trim()) {
        const finalTranscript = event.transcript.trim();
        
        // Add to conversation history
        const assistantMsg = { role: "assistant", content: finalTranscript };
        conversation.push(assistantMsg);
        
        // Check for member transition keywords
        const lower = finalTranscript.toLowerCase();
        if (
          lower.includes("thanks") ||
          lower.includes("great to hear about your progress") ||
          lower.includes("moving to the next member") ||
          lower.includes("next person") ||
          lower.includes("next member") ||
          lower.includes("moving to") ||
          lower.includes("let me move to") ||
          lower.includes("next:") ||
          (lower.includes("next") && (lower.includes("member") || lower.includes("person")))
        ) {
          handleMemberTransition();
        }
      }
      
      checkAndUnmuteMicrophone("response.audio_transcript.done", event.response_id);
      return;
    }

    // Reuse existing UI hooks for popup updates
    handleAIEvent(event);
    
  } catch (error) {
  }
}

function updatePopupWithAIResponse(message) {
  // Update the popup if it exists
  const popup = document.getElementById('ai-scrum-popup-card');
  if (popup) {
    // You can add a chat area to show the conversation
  }
}

function updatePopupWithUserMessage(message) {
  // Update the popup if it exists
  const popup = document.getElementById('ai-scrum-popup-card');
  if (popup) {
    // Display user message
  }
}

// Wait until Google Meet toolbar is ready
function waitForToolbar() {
  const toolbar = document.querySelector('[aria-label="Call controls"]');
  if (toolbar) {
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
        // Just open the popup - WebRTC connection will happen when Start is clicked
        showPopupCard();
      });

      toolbar.appendChild(btn);
    }
  } else {
    setTimeout(waitForToolbar, 2000);
  }
}

// Test function to verify microphone is working
function testMicrophone() {
  // Test popup update
  updatePopupMicrophoneStatus('Ready');
}

// Handle member transitions from AI responses
function handleMemberTransition() {
  const nextIndex = projectContext.memberIndex + 1;
  if (nextIndex < projectContext.members.length) {
    projectContext.memberIndex = nextIndex;
    popupState.memberIndex = nextIndex; // Keep popup state in sync
    refreshPopup();
  } else {
    // All members completed - but don't show download button automatically
    // User must manually stop the session to see the download button
  }
}

// Expose test function globally for debugging
window.testAIScrumMicrophone = testMicrophone;

// Expose email test function globally for debugging
window.testGetUserEmail = testGetUserEmail;

// Test function to fetch user email using Chrome Identity API
async function testGetUserEmail() {
  try {
    const response = await sendMessageToBackground('GET_USER_EMAIL');
    if (response.success) {
      // You can also update the popup state with this email
      if (response.email && !popupState.userEmail) {
        popupState.userEmail = response.email;
      }
      return response.email;
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}

// Initialize popup styles when the script loads
loadPopupStyles();

// Run after page loads
window.addEventListener("load", () => {
  waitForToolbar();
});
