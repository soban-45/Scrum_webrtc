// Popup functionality for AI Scrum Chrome Extension

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
  popup.innerHTML = `
    <div class="ai-scrum-popup-header" id="popup-header">
      <div class="ai-scrum-popup-title">AI Scrum Master</div>
      <div class="popup-controls">
        <button class="ai-scrum-control-btn" id="minimize-btn" title="Minimize">−</button>
        <button class="ai-scrum-close" id="close-btn" title="Close">×</button>
      </div>
      <!-- Minimized state buttons (hidden by default) -->
      <div class="minimized-controls" style="display: none;">
        <button class="minimized-btn start-btn" id="minimized-start-btn" title="Start Session">▶</button>
        <button class="minimized-btn stop-btn" id="minimized-stop-btn" title="Stop Session" disabled>⏹</button>
        <button class="minimized-btn expand-btn" id="expand-btn" title="Expand">□</button>
      </div>
    </div>
    <div class="ai-scrum-popup-content" id="popup-content">
      <div class="ai-scrum-status-display">
        <span>Status: Bot Admitted</span>
        <div class="ai-scrum-indicator ready"></div>
      </div>
      <div class="ai-scrum-popup-buttons">
        <button class="ai-scrum-popup-btn start-btn" id="start-session-btn">
          <span>▶</span> Start Session
        </button>
        <button class="ai-scrum-popup-btn stop-btn" id="stop-session-btn" disabled>
          <span>⏹</span> Stop Session
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  // Make popup draggable
  makeDraggable(popup);

  // Add event listeners
  setupPopupEventListeners(popup);
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
      // If using transform, top/right/left might not be directly updated in the same way
      // The transform will move the element relative to its original position.
      // If you need absolute positioning based on mouse, you'd set top/left directly.
      // For now, let's rely on transform for simplicity as it often works well.
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

// Setup popup event listeners
function setupPopupEventListeners(popup) {
  const closeBtn = popup.querySelector('#close-btn');
  const minimizeBtn = popup.querySelector('#minimize-btn');
  const startBtn = popup.querySelector('#start-session-btn');
  const stopBtn = popup.querySelector('#stop-session-btn');
  const content = popup.querySelector('#popup-content');
  const header = popup.querySelector('#popup-header'); // For minimize/maximize button logic

  let isMinimized = false;

  // Close button
  closeBtn.addEventListener('click', () => {
    popup.remove();
  });

  // Minimize/Maximize button
  minimizeBtn.addEventListener('click', () => {
    if (isMinimized) {
      // Expand
      popup.classList.remove('minimized');
      minimizeBtn.innerHTML = '−';
      minimizeBtn.title = 'Minimize';
      // Show normal controls, hide minimized controls
      document.querySelector('.popup-controls').style.display = 'flex';
      document.querySelector('.minimized-controls').style.display = 'none';
      isMinimized = false;
    } else {
      // Minimize
      popup.classList.add('minimized');
      minimizeBtn.innerHTML = '□';
      minimizeBtn.title = 'Expand';
      // Hide normal controls, show minimized controls
      document.querySelector('.popup-controls').style.display = 'none';
      document.querySelector('.minimized-controls').style.display = 'flex';
      isMinimized = true;
    }
  });

  // Start session
  startBtn.addEventListener('click', () => {
    console.log('[Content] Starting AI session');
    startBtn.disabled = true;
    stopBtn.disabled = false;

    // Update status
    const statusDisplay = popup.querySelector('.ai-scrum-status-display span');
    const indicator = popup.querySelector('.ai-scrum-indicator');
    statusDisplay.textContent = 'Status: Connecting...';
    indicator.className = 'ai-scrum-indicator connecting';

    // Connect to WebRTC
    chrome.runtime.sendMessage({ action: "connectWebRTC" }, (response) => {
      if (response && response.success) {
        statusDisplay.textContent = 'Status: Active';
        indicator.className = 'ai-scrum-indicator active';
        console.log('[Content] AI session started - WebRTC connected');
      } else {
        statusDisplay.textContent = 'Status: Connection Failed';
        indicator.className = 'ai-scrum-indicator error';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        console.error('[Content] WebRTC connection failed:', response?.error);
      }
    });
  });

  // Stop session
  stopBtn.addEventListener('click', () => {
    console.log('[Content] Stopping AI session');
    startBtn.disabled = false;
    stopBtn.disabled = true;

    // Update status
    const statusDisplay = popup.querySelector('.ai-scrum-status-display span');
    const indicator = popup.querySelector('.ai-scrum-indicator');
    statusDisplay.textContent = 'Status: Ready';
    indicator.className = 'ai-scrum-indicator ready';

    // Send stop message to background script
    chrome.runtime.sendMessage({
      action: 'stopBot',
      meetUrl: window.location.href
    });
  });

  // Setup minimized state buttons
  const minimizedStartBtn = popup.querySelector('#minimized-start-btn');
  const minimizedStopBtn = popup.querySelector('#minimized-stop-btn');
  const expandBtn = popup.querySelector('#expand-btn');

  // Minimized start button
  minimizedStartBtn.addEventListener('click', () => {
    console.log('[Content] Starting AI session (minimized)');
    minimizedStartBtn.disabled = true;
    minimizedStopBtn.disabled = false;
    startBtn.disabled = true;
    stopBtn.disabled = false;

    // Update status in normal view (if visible)
    const statusDisplay = popup.querySelector('.ai-scrum-status-display span');
    const indicator = popup.querySelector('.ai-scrum-indicator');
    if (statusDisplay && indicator) {
      statusDisplay.textContent = 'Status: Connecting...';
      indicator.className = 'ai-scrum-indicator connecting';
    }

    // Connect to WebRTC
    chrome.runtime.sendMessage({ action: "connectWebRTC" }, (response) => {
      if (response && response.success) {
        if (statusDisplay && indicator) {
          statusDisplay.textContent = 'Status: Active';
          indicator.className = 'ai-scrum-indicator active';
        }
        console.log('[Content] AI session started - WebRTC connected');
      } else {
        if (statusDisplay && indicator) {
          statusDisplay.textContent = 'Status: Connection Failed';
          indicator.className = 'ai-scrum-indicator error';
        }
        minimizedStartBtn.disabled = false;
        minimizedStopBtn.disabled = true;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        console.error('[Content] WebRTC connection failed:', response?.error);
      }
    });
  });

  // Minimized stop button
  minimizedStopBtn.addEventListener('click', () => {
    console.log('[Content] Stopping AI session (minimized)');
    minimizedStartBtn.disabled = false;
    minimizedStopBtn.disabled = true;
    startBtn.disabled = false;
    stopBtn.disabled = true;

    // Update status in normal view (if visible)
    const statusDisplay = popup.querySelector('.ai-scrum-status-display span');
    const indicator = popup.querySelector('.ai-scrum-indicator');
    if (statusDisplay && indicator) {
      statusDisplay.textContent = 'Status: Ready';
      indicator.className = 'ai-scrum-indicator ready';
    }

    // Send stop message to background script
    chrome.runtime.sendMessage({
      action: 'stopBot',
      meetUrl: window.location.href
    });
  });

  // Expand button (in minimized state)
  expandBtn.addEventListener('click', () => {
    popup.classList.remove('minimized');
    minimizeBtn.innerHTML = '−';
    minimizeBtn.title = 'Minimize';
    // Show normal controls, hide minimized controls
    document.querySelector('.popup-controls').style.display = 'flex';
    document.querySelector('.minimized-controls').style.display = 'none';
    isMinimized = false;
  });

  // Initial state setup if popup is created minimized (optional)
  if (isMinimized) {
    popup.classList.add('minimized');
    minimizeBtn.innerHTML = '□';
    minimizeBtn.title = 'Expand';
    // Show minimized controls, hide normal controls
    document.querySelector('.popup-controls').style.display = 'none';
    document.querySelector('.minimized-controls').style.display = 'flex';
  }
}

// Load external CSS file for popup styles
function loadPopupStyles() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = chrome.runtime.getURL('popup.css');
  document.head.appendChild(link);
}

// Initialize popup styles when the script loads
loadPopupStyles();

// Export functions for use in content.js
window.AIScrumPopup = {
  showPopupCard
};
