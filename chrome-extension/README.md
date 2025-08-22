
# AI Scrum Master Chrome Extension

A Chrome extension that integrates with Google Meet to provide AI-powered Scrum Master capabilities using WebRTC communication with your AI backend.

## Features

- 🎯 **Dual Capture Modes**: Caption scraping or audio capture
- 🎮 **Floating Control Panel**: Draggable, non-intrusive UI
- 🔊 **Real-time Audio**: AI responses played directly in Meet
- 💬 **Chat Integration**: AI responses can be injected into Meet chat
- 🔒 **Privacy-focused**: Works with your own AI backend

## Installation

1. **Download/Clone** this extension folder to your local machine

2. **Add Icons**: 
   - Create or add `icon16.png`, `icon48.png`, and `icon128.png` to the `icons/` folder
   - These should be square icons representing your AI assistant

3. **Configure Backend URL**:
   - Open `background.js`
   - Update `BACKEND_SIGNALING_URL` to point to your AI backend
   - Default: `http://localhost:8000/webrtc-signal/`

4. **Load Extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select this extension folder

## Usage

1. **Join a Google Meet**: Navigate to any `https://meet.google.com/*` URL

2. **Locate Control Panel**: Look for the floating "AI Scrum Master" panel (top-right by default)

3. **Choose Capture Mode**:
   - **Caption Scraping**: Reads Meet's live captions (captions must be enabled)
   - **Audio Capture**: Captures Meet's audio output directly

4. **Start Session**: Click "Start AI Session" to connect to your AI backend

5. **Interact**: The AI will listen to the meeting and provide Scrum guidance

## Configuration

### Backend Integration

The extension expects your AI backend to:

1. **Accept WebRTC offers** at `/webrtc-signal/` endpoint
2. **Return WebRTC answers** in the response
3. **Handle data channel messages** for text communication
4. **Send audio streams** back for AI responses

### Capture Modes

**Caption Scraping Mode**:
- Requires Google Meet captions to be enabled
- Scrapes text from Meet's caption DOM elements
- Sends text over WebRTC data channel

**Audio Capture Mode**:
- Uses Chrome's `tabCapture` API
- Captures Meet's audio output
- Sends audio over WebRTC audio channel

## File Structure

```
chrome-extension/
├── manifest.json          # Extension configuration
├── background.js           # Service worker for WebRTC handling
├── content.js             # DOM manipulation and UI
├── styles.css             # Floating panel styles
├── popup.html             # Extension popup
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              # This file
```

## Customization

### Styling
- Modify `styles.css` to change the appearance of the floating panel
- Update colors, positioning, animations, etc.

### Backend Communication
- Update `background.js` to match your AI backend's WebRTC signaling format
- Modify message handling in `handleBackendMessage()`

### UI Behavior
- Customize `content.js` to change how the extension interacts with Meet
- Modify caption scraping selectors if Meet's DOM structure changes

## Troubleshooting

**Panel not appearing**: 
- Check that you're on a `meet.google.com` URL
- Verify the extension is enabled in `chrome://extensions/`

**Captions not working**: 
- Enable captions in Google Meet
- Check browser console for caption container detection logs

**Audio capture failing**: 
- Ensure the extension has `tabCapture` permission
- Check that Meet is playing audio

**Backend connection issues**: 
- Verify your AI backend is running and accessible
- Check the WebRTC signaling endpoint URL
- Review browser console for connection errors

## Development

To modify the extension:

1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon for your extension
4. Reload any Google Meet tabs to apply changes

## Security Notes

- Extension only runs on Google Meet domains
- Uses your own AI backend (no third-party AI services)
- Requires explicit permissions for tab capture
- All audio/text data is sent to your specified backend only

## Browser Compatibility

- **Chrome**: Full support (recommended)
- **Edge**: Should work with Manifest V3 support
- **Firefox**: Not supported (different extension API)
