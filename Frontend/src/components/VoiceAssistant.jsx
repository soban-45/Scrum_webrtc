import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Button,
  LinearProgress,
  styled,
  keyframes,
  Typography,
  IconButton,
  Paper,
  Avatar,
  Chip,
} from "@mui/material";
import {
  Mic,
  Stop,
  PlayArrow,
  People as PeopleIcon,
  Download as DownloadIcon,
} from "@mui/icons-material";
import ConversationDisplay from "./ConversationDisplay";
import LiveTranscript from "./LiveTranscript";

const BACKEND_URL =
  "http://localhost:8000"; // Replace with your backend URL

const pulse = keyframes`
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
`;

const FloatingButton = styled(Button)(({ theme }) => ({
  borderRadius: "50%",
  width: 64,
  height: 64,
  minWidth: 0,
  boxShadow: theme.shadows[6],
  "&:hover": {
    boxShadow: theme.shadows[8],
  },
}));

const AnimatedButton = styled(FloatingButton)({
  animation: `${pulse} 2s infinite`,
});

function VoiceAssistant() {
  const [conversation, setConversation] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");

  // WebRTC state
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const noiseSuppressionRef = useRef(null);

  // Session state
  const [sessionConfigured, setSessionConfigured] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [currentAssistantText, setCurrentAssistantText] = useState("");

  // Audio completion tracking to prevent race conditions
  const audioStateRef = useRef({
    isAudioPlaying: false,
    isTranscriptComplete: false,
    isResponseComplete: false,
    isAudioStreamComplete: false, // New state to track if audio stream is done
    currentResponseId: null,
    unmuteTimeoutId: null,
    audioProgressCheckInterval: null, // Interval for monitoring audio progress
    lastAudioTime: 0, // To track if audio playback time is advancing
    audioEndedNaturally: false, // Flag to indicate if audio ended via 'onended' event
  });

  // Real-time transcription state
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [realtimeWords, setRealtimeWords] = useState([]);
  const [currentWord, setCurrentWord] = useState("");
  const speechRecognitionRef = useRef(null);
  const interimResultRef = useRef("");

  const [projectList, setProjectList] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectDetails, setProjectDetails] = useState(null);
  const [memberIndex, setMemberIndex] = useState(0);
  const [members, setMembers] = useState([]);
  const [standupResults, setStandupResults] = useState([]);
  const [lastPlans, setLastPlans] = useState({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDownloadButton, setShowDownloadButton] = useState(false);

  const fetchLastStandup = async (employeeId) => {
    if (!employeeId) {
      console.log("⚠️ No employee ID provided for last standup fetch");
      return null;
    }

    console.log(`🔍 Fetching last standup for employee: ${employeeId}`);
    try {
      const res = await fetch(
        `${BACKEND_URL}/employee-last-standup/?employee_id=${encodeURIComponent(employeeId)}`,
      );

      if (!res.ok) {
        console.log(
          `⚠️ No previous standup found for ${employeeId} (${res.status})`,
        );
        return null;
      }

      const json = await res.json();
      const standupData = json.data || null;

      if (standupData) {
        console.log(`✅ Found previous standup for ${employeeId}:`, {
          date: standupData.Date,
          completed: standupData["Completed Yesterday"],
          planned: standupData["Plan Today"],
          blockers: standupData["Blockers"],
        });
      } else {
        console.log(`ℹ️ No previous standup data for ${employeeId}`);
      }

      return standupData;
    } catch (err) {
      console.error(`❌ Failed to fetch last standup for ${employeeId}:`, err);
      return null;
    }
  };

  const fetchAllLastStandups = async (membersList) => {
    if (!membersList || membersList.length === 0) {
      console.log("⚠️ No members list provided for standup fetch");
      return {};
    }

    console.log(
      `🔍 Fetching previous standups for ${membersList.length} team members`,
    );

    const promises = membersList.map(async (m) => {
      try {
        const data = await fetchLastStandup(m.employee_id);
        return { id: m.employee_id, name: m.name, data };
      } catch (err) {
        console.error(
          `❌ Error fetching standup for ${m.name} (${m.employee_id}):`,
          err,
        );
        return { id: m.employee_id, name: m.name, data: null };
      }
    });

    const results = await Promise.all(promises);
    const map = {};
    let foundCount = 0;

    results.forEach((r) => {
      map[r.id] = r.data || null;
      if (r.data) {
        foundCount++;
        console.log(
          `📊 Previous standup loaded for ${r.name}: ${r.data.Date || "Unknown date"}`,
        );
      } else {
        console.log(`📄 No previous standup for ${r.name}`);
      }
    });

    console.log(
      `✅ Loaded previous standups: ${foundCount}/${membersList.length} members have previous data`,
    );
    return map;
  };

  useEffect(() => {
    fetch(`${BACKEND_URL}/projects/`)
      .then((res) => res.json())
      .then((data) => setProjectList(data))
      .catch((err) => console.error("Error fetching projects", err));

    // Initialize remote audio element
    remoteAudioRef.current = document.createElement("audio");
    remoteAudioRef.current.autoplay = true;
    document.body.appendChild(remoteAudioRef.current);

    // Initialize real-time speech recognition for live transcription
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      speechRecognitionRef.current = new SpeechRecognition();

      speechRecognitionRef.current.continuous = true;
      speechRecognitionRef.current.interimResults = true;
      speechRecognitionRef.current.lang = "en-US";
      speechRecognitionRef.current.maxAlternatives = 1;

      speechRecognitionRef.current.onresult = (event) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // Update live transcript with word-by-word animation
        if (interimTranscript) {
          const words = interimTranscript.trim().split(" ");
          const currentInterim = interimTranscript.trim();

          // Detect new words being spoken
          if (currentInterim !== interimResultRef.current) {
            const prevWords = interimResultRef.current.split(" ");
            const newWords = words.slice(prevWords.length - 1);

            if (newWords.length > 0) {
              setCurrentWord(newWords[newWords.length - 1]);
              setRealtimeWords(words);
            }

            interimResultRef.current = currentInterim;
            setLiveTranscript(currentInterim);
          }
        }

        if (finalTranscript) {
          // Reset for next speech
          setRealtimeWords([]);
          setCurrentWord("");
          interimResultRef.current = "";
        }
      };

      speechRecognitionRef.current.onerror = (event) => {
        console.log("Speech recognition error:", event.error);
        if (event.error !== "no-speech") {
          // Restart recognition if it stops due to error
          setTimeout(() => {
            if (isUserSpeaking && speechRecognitionRef.current) {
              try {
                speechRecognitionRef.current.start();
              } catch (e) {
                console.log("Could not restart speech recognition:", e);
              }
            }
          }, 1000);
        }
      };

      speechRecognitionRef.current.onend = () => {
        // Auto-restart speech recognition if user is still speaking
        if (isUserSpeaking && !isAssistantSpeaking) {
          try {
            speechRecognitionRef.current.start();
          } catch (e) {
            console.log("Speech recognition already running or unavailable");
          }
        }
      };
    } else {
      console.warn("Speech Recognition not supported in this browser");
    }

    return () => {
      cleanupWebRTC();
      if (remoteAudioRef.current) {
        remoteAudioRef.current.remove();
      }
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
    };
  }, []);

  const handleProjectSelect = async (event) => {
    const projectId = event.target.value;
    setSelectedProject(projectId);
    setMemberIndex(0);
    setStandupResults([]);
    try {
      const res = await fetch(
        `${BACKEND_URL}/projects/?project_id=${projectId}`,
      );
      const data = await res.json();
      setProjectDetails(data);
      const mems = (data.employees || []).map((e) => ({
        id: e.id,
        name: e.employee_name,
        employee_id: e.employee_id,
        role: e.role,
      }));
      setMembers(mems);

      const plansMap = await fetchAllLastStandups(mems);
      setLastPlans(plansMap);
    } catch (err) {
      console.error("Error fetching project details:", err);
    }
  };

  const buildDynamicSystemMessage = (
    project,
    membersList,
    lastPlansMap = {},
  ) => {
    const memberNames = membersList
      .map((m) => `${m.name} (${m.role})`)
      .join(", ");

    const perMemberNotes = membersList
      .map((m) => {
        const last = lastPlansMap[m.employee_id];
        if (!last)
          return `${m.name}: No previous standup data available - this will be their first standup.`;

        const dateStr = last.Date
          ? new Date(last.Date).toLocaleDateString()
          : "previous date";

        const completed = last["Completed Yesterday"] || "Not specified";
        const planned = last["Plan Today"] || "Not specified";
        const blockers = last["Blockers"] || "None";

        return `${m.name} - Last standup on ${dateStr}: They completed "${completed}", planned "${planned}", and had blockers: "${blockers}".`;
      })
      .join("\n");

    console.log("🤖 Building AI system message with context:", {
      project: project.project_name,
      memberCount: membersList.length,
      membersWithPreviousData:
        Object.values(lastPlansMap).filter(Boolean).length,
      previousTasksDetails: membersList.map((m) => ({
        name: m.name,
        previousCompleted:
          lastPlansMap[m.employee_id]?.["Completed Yesterday"] || "None",
        previousTask: lastPlansMap[m.employee_id]?.["Plan Today"] || "None",
        previousBlockers: lastPlansMap[m.employee_id]?.["Blockers"] || "None",
      })),
    });

    console.log("🔍 EXACT Previous Data Being Used:", lastPlansMap);

    return `You are a friendly, warm, and professional standup facilitator for "${project.project_name}". Your goal is to create a comfortable, supportive environment while gathering standup updates.

Team members: ${memberNames}

Previous standup context:
${perMemberNotes}

PERSONALITY & TONE:
- Be warm, friendly, and encouraging
- Use casual, conversational language (like "Hey there!", "That's awesome!", "Cool!")
- Show genuine interest in their work
- Be supportive when they mention challenges
- Keep the mood light and positive
- Avoid being too formal or robotic

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
- If they have previous data, reference it directly: "Hey [Name]! I see you were planning to work on '[EXACT previous plan text]' today - how did that go?"
- If they had blockers, ask: "I also remember you mentioned '[EXACT previous blocker text]' - did you resolve that?"
- If no previous data: "Hi [Name]! Let's start with what you accomplished yesterday"
- NEVER make up or assume tasks - only use the exact text provided
- Be encouraging: "Great job on that!" or "Nice progress!"

HANDLING OFF-TOPIC RESPONSES:
- If someone talks about unrelated topics, gently redirect: "That's interesting! But let's focus on your work updates for the standup. So about [question]..."
- Stay friendly while redirecting: "I appreciate you sharing that! Now, back to your standup - can you tell me about [specific question]?"
- Don't be harsh, just guide them back smoothly

EXAMPLE OPENING:
"Hello! Let's begin your standup update, ${membersList[0]?.name}! ${lastPlansMap[membersList[0]?.employee_id]?.["Plan Today"] ? `Yesterday you planned to ${lastPlansMap[membersList[0]?.employee_id]["Plan Today"].toLowerCase()}. How did that go? What were you able to complete?` : "What did you work on yesterday?"}"

MEMBER TRANSITIONS:
When moving to next member, say: "Thanks [current name]. Moving to the next member. Next: [next name]. [Previous task reference if available] [Next name], did you complete those items yesterday?"

CRITICAL RULES: 
- Complete ALL questions for one member before moving to next
- ONLY use exact text from previous standup data - NEVER hallucinate or make up tasks
- Use the EXACT conversational style: "Yesterday you planned to [task] - how did that go?"
- Keep it natural and friendly like the original assistant
- Don't be rush - let them fully answer each question
- Start the conversation immediately upon session start
- Always reference their previous plan directly when available`;
  };

  const setupWebRTC = async () => {
    try {
      // Enhanced microphone settings optimized for headphones
      const stream = await navigator.mediaDevices.getUserMedia({
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

      streamRef.current = stream;
      const [track] = stream.getAudioTracks();
      trackRef.current = track;
      console.log(
        "Microphone access granted with headphone optimization:",
        track.label,
      );

      // Enhanced audio processing pipeline for headphones
      audioContextRef.current = new (window.AudioContext ||
        window.webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: "interactive",
      });

      const source = audioContextRef.current.createMediaStreamSource(stream);

      // Create analyser for volume monitoring with headphone-optimized settings
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048; // Higher resolution for better headphone detection
      analyserRef.current.smoothingTimeConstant = 0.9; // More aggressive smoothing
      analyserRef.current.minDecibels = -80; // Better sensitivity for headphones
      analyserRef.current.maxDecibels = -20;

      // Multi-stage audio processing for headphones
      let audioChain = source;

      // 1. High-pass filter to remove low-frequency noise
      if (audioContextRef.current.createBiquadFilter) {
        const highPassFilter = audioContextRef.current.createBiquadFilter();
        highPassFilter.type = "highpass";
        highPassFilter.frequency.setValueAtTime(
          100,
          audioContextRef.current.currentTime,
        );
        highPassFilter.Q.setValueAtTime(
          0.7,
          audioContextRef.current.currentTime,
        );
        audioChain.connect(highPassFilter);
        audioChain = highPassFilter;
      }

      // 2. Dynamic range compressor for consistent levels
      if (audioContextRef.current.createDynamicsCompressor) {
        const compressor = audioContextRef.current.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(
          -30,
          audioContextRef.current.currentTime,
        ); // More aggressive for headphones
        compressor.knee.setValueAtTime(40, audioContextRef.current.currentTime);
        compressor.ratio.setValueAtTime(8, audioContextRef.current.currentTime);
        compressor.attack.setValueAtTime(
          0.001,
          audioContextRef.current.currentTime,
        ); // Faster attack
        compressor.release.setValueAtTime(
          0.1,
          audioContextRef.current.currentTime,
        ); // Faster release
        audioChain.connect(compressor);
        audioChain = compressor;
      }

      // 3. Noise gate to prevent headphone bleed
      const noiseGate = audioContextRef.current.createGain();
      noiseGate.gain.setValueAtTime(0.2, audioContextRef.current.currentTime); // Lower threshold
      noiseSuppressionRef.current = noiseGate;
      audioChain.connect(noiseGate);
      audioChain = noiseGate;

      // Connect to analyser for monitoring
      audioChain.connect(analyserRef.current);

      // Create WebRTC peer connection
      pcRef.current = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
        iceCandidatePoolSize: 10,
      });

      // Log ICE candidates
      pcRef.current.onicecandidate = (event) => {
        console.log("[ICE] onicecandidate:", event.candidate);
      };

      // Create data channel for OpenAI communication
      dcRef.current = pcRef.current.createDataChannel("oai-events", {
        ordered: true,
        protocol: "json",
      });

      setupDataChannel();

      // Add audio track to WebRTC
      pcRef.current.addTrack(track, stream);

      // Handle remote audio stream
      pcRef.current.ontrack = (event) => {
        console.log("Received remote audio track");
        const mediaStream = new MediaStream([event.track]);
        remoteAudioRef.current.srcObject = mediaStream;

        remoteAudioRef.current.onplaying = () => {
          setIsAssistantSpeaking(true);
          audioStateRef.current.isAudioPlaying = true;
          audioStateRef.current.audioEndedNaturally = false; // Reset flag
          startAudioProgressMonitoring(); // Start monitoring progress
          muteMicrophone(); // Ensure mic is muted when audio starts
          console.log("🔊 Assistant audio started playing - mic muted");
        };

        remoteAudioRef.current.onended = () => {
          console.log("🔇 Assistant audio ended naturally");
          audioStateRef.current.isAudioPlaying = false;
          audioStateRef.current.audioEndedNaturally = true; // Set flag
          stopAudioProgressMonitoring(); // Stop monitoring
          checkAndUnmuteMicrophone("audio_track_ended", audioStateRef.current.currentResponseId);
        };

        remoteAudioRef.current.onpause = () => {
          console.log("⏸️ Assistant audio paused");
          audioStateRef.current.isAudioPlaying = false;
          stopAudioProgressMonitoring();
        };

        // Additional safety check for when audio stops
        remoteAudioRef.current.addEventListener("loadstart", () => {
          console.log("🎵 New audio track loading");
          audioStateRef.current.isAudioPlaying = true;
          audioStateRef.current.audioEndedNaturally = false; // Reset on new load
          startAudioProgressMonitoring(); // Start monitoring
          setIsAssistantSpeaking(true);
          muteMicrophone();
        });
      };

      // ICE connection state monitoring
      pcRef.current.oniceconnectionstatechange = () => {
        console.log(
          "[ICE] ICE connection state changed:",
          pcRef.current.iceConnectionState,
        );
      };

      // Monitor volume levels
      monitorAudioLevels();

      return true;
    } catch (error) {
      console.error("WebRTC setup error:", error);
      throw error;
    }
  };

  const setupDataChannel = () => {
    dcRef.current.addEventListener("open", () => {
      console.log("🔌 Data channel opened - Configuring AI session");

      const sessionUpdate = {
        type: "session.update",
        session: {
          voice: "alloy",
          instructions: buildDynamicSystemMessage(
            projectDetails,
            members,
            lastPlans,
          ),
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
      setSessionConfigured(true);

      // Auto-start the AI conversation immediately with original assistant style
      setTimeout(() => {
        console.log("🚀 Auto-starting AI conversation - AI will speak first");

        const firstMember = members[0];
        const lastForFirst = lastPlans[firstMember?.employee_id];

        const openingPrompt = lastForFirst?.["Plan Today"]
          ? `Hello! Let's begin your standup update, ${firstMember.name}! Yesterday you planned to ${lastForFirst["Plan Today"].toLowerCase()}. How did that go? What were you able to complete?`
          : `Hello! Let's begin your standup update, ${firstMember.name}! What did you work on yesterday?`;

        const autoStartMessage = {
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            instructions: `Say exactly: "${openingPrompt}" - use this exact greeting and question format.`,
          },
        };
        sendData(autoStartMessage);

        // Ensure microphone is muted while AI starts speaking
        muteMicrophone();
        setIsAssistantSpeaking(true);
        console.log("🔇 Microphone muted - AI starting conversation");
      }, 1500); // Slightly longer delay to ensure session is ready
    });

    dcRef.current.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        handleServerEvent(data);
      } catch (error) {
        console.error("Error parsing data channel message:", error);
      }
    });

    dcRef.current.addEventListener("error", (error) => {
      console.error("Data channel error:", error);
    });
  };

  const sendData = (data) => {
    if (dcRef.current && dcRef.current.readyState === "open") {
      dcRef.current.send(JSON.stringify(data));
    } else {
      console.warn("Data channel not ready");
    }
  };

  // New function for monitoring audio progress
  const startAudioProgressMonitoring = () => {
    const audioState = audioStateRef.current;

    // Clear existing interval
    if (audioState.audioProgressCheckInterval) {
      clearInterval(audioState.audioProgressCheckInterval);
    }

    audioState.audioProgressCheckInterval = setInterval(() => {
      const remoteAudio = remoteAudioRef.current;
      if (!remoteAudio) return;

      const currentTime = remoteAudio.currentTime;
      const duration = remoteAudio.duration;
      const isPlaying = !remoteAudio.paused && !remoteAudio.ended;

      // Check if audio time is advancing
      const timeAdvancing = currentTime > audioState.lastAudioTime;
      audioState.lastAudioTime = currentTime;

      console.log("🎵 Audio progress:", {
        currentTime: currentTime.toFixed(1),
        duration: isFinite(duration) ? duration.toFixed(1) : "∞",
        isPlaying,
        timeAdvancing,
        ended: remoteAudio.ended
      });

      // If audio stopped advancing for more than 1 second, consider it finished
      if (!timeAdvancing && isPlaying && currentTime > 0) {
        console.log("⚠️ Audio stopped advancing - considering finished");
        audioState.isAudioPlaying = false;
        stopAudioProgressMonitoring();
        checkAndUnmuteMicrophone("audio_progress_stopped", audioState.currentResponseId);
      }
    }, 500); // Check every 500ms
  };

  const stopAudioProgressMonitoring = () => {
    const audioState = audioStateRef.current;
    if (audioState.audioProgressCheckInterval) {
      clearInterval(audioState.audioProgressCheckInterval);
      audioState.audioProgressCheckInterval = null;
    }
  };

  const checkAndUnmuteMicrophone = (eventType, responseId) => {
    const audioState = audioStateRef.current;

    // Clear any existing timeout
    if (audioState.unmuteTimeoutId) {
      clearTimeout(audioState.unmuteTimeoutId);
      audioState.unmuteTimeoutId = null;
    }

    // Only proceed if this is the current response
    if (audioState.currentResponseId !== responseId) {
      console.log(`⚠️ Ignoring ${eventType} for old response:`, responseId);
      return;
    }

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
      setIsAssistantSpeaking(false);
      unmuteMicrophone();
      resetAudioState();
      return;
    }

    // For other events, ensure all conditions are met and audio is truly finished
    const allConditionsMet = !audioState.isAudioPlaying &&
      audioState.isTranscriptComplete &&
      audioState.isResponseComplete &&
      audioState.isAudioStreamComplete;

    if (allConditionsMet) {
      // Double-check that audio element is not playing
      const remoteAudio = remoteAudioRef.current;
      const isAudioElementPlaying = remoteAudio && 
        !remoteAudio.paused && 
        !remoteAudio.ended &&
        remoteAudio.readyState > 0;

      if (isAudioElementPlaying) {
        console.log("🔄 Audio element still playing, waiting for natural end");
        return;
      }

      console.log("✅ All conditions met - Unmuting microphone");
      setIsAssistantSpeaking(false);
      unmuteMicrophone();
      resetAudioState();
    } else {
      console.log("⏳ Waiting for all conditions to be met before unmuting");
    }
  };

  const resetAudioState = () => {
    const audioState = audioStateRef.current;
    stopAudioProgressMonitoring();
    audioState.isAudioPlaying = false;
    audioState.isTranscriptComplete = false;
    audioState.isResponseComplete = false;
    audioState.isAudioStreamComplete = false;
    audioState.currentResponseId = null;
    audioState.audioEndedNaturally = false;
    audioState.lastAudioTime = 0;
  };

  const handleServerEvent = (event) => {
    console.log("[EVENT] type:", event.type, "payload:", JSON.stringify(event));

    try {
      // Handle session events
      if (
        event.type === "session.created" ||
        event.type === "session.updated"
      ) {
        console.log("Session event:", event.type);
        setSessionConfigured(true);
        return;
      }

      // Handle response management
      if (event.type === "response.created") {
        console.log(
          "[RESPONSE] Created - AI starting to speak:",
          event.response?.id,
        );

        // Initialize audio state for new response
        const audioState = audioStateRef.current;
        audioState.isAudioPlaying = true; // Assume playing until proven otherwise
        audioState.isTranscriptComplete = false;
        audioState.isResponseComplete = false;
        audioState.isAudioStreamComplete = false; // Reset this for new response
        audioState.audioEndedNaturally = false; // Reset this flag
        audioState.currentResponseId = event.response?.id;

        // Clear any pending unmute timeouts
        if (audioState.unmuteTimeoutId) {
          clearTimeout(audioState.unmuteTimeoutId);
          audioState.unmuteTimeoutId = null;
        }

        setIsAssistantSpeaking(true);
        muteMicrophone();
        return;
      }

      if (event.type === "response.done") {
        console.log(
          "[RESPONSE] Done - AI response complete:",
          event.response?.id,
        );
        audioStateRef.current.isResponseComplete = true;
        checkAndUnmuteMicrophone("response.done", event.response?.id);
        return;
      }

      // Handle audio buffer events - These indicate actual audio streaming
      if (event.type === "response.audio.delta") {
        console.log("[AUDIO] Audio delta received - AI is actively speaking");
        if (!isAssistantSpeaking) {
          setIsAssistantSpeaking(true);
          muteMicrophone();
        }
        // Ensure audio is considered playing and monitoring starts if not already
        if (!audioStateRef.current.isAudioPlaying) {
          audioStateRef.current.isAudioPlaying = true;
          startAudioProgressMonitoring();
        }
        return;
      }

      if (event.type === "response.audio.done") {
        console.log("[AUDIO] Audio stream complete:", event.response_id);
        audioStateRef.current.isAudioPlaying = false; // Mark as not playing
        audioStateRef.current.isAudioStreamComplete = true; // Mark stream as complete
        stopAudioProgressMonitoring(); // Stop monitoring
        checkAndUnmuteMicrophone("response.audio.done", event.response_id);
        return;
      }

      // Handle output audio buffer events (more reliable for audio state)
      if (event.type === "response.output_audio_buffer.started") {
        console.log("[OUTPUT AUDIO] Started - Muting microphone");
        setIsAssistantSpeaking(true);
        muteMicrophone();
        // Ensure audio state reflects playback
        audioStateRef.current.isAudioPlaying = true;
        audioStateRef.current.audioEndedNaturally = false; // Reset flag
        startAudioProgressMonitoring();
        return;
      }

      if (event.type === "response.output_audio_buffer.done") {
        console.log("[OUTPUT AUDIO] Done - Audio buffer complete");
        // This event might be redundant with response.audio.done or handled by onended.
        // The primary logic for unmute should rely on response.audio.done or onended.
        return;
      }

      if (event.type === "output_audio_buffer.stopped") {
        console.log("[OUTPUT AUDIO] Stopped - Audio playback has ended, unmuting microphone");
        audioStateRef.current.isAudioPlaying = false;
        audioStateRef.current.audioEndedNaturally = true;
        stopAudioProgressMonitoring();
        setIsAssistantSpeaking(false);
        unmuteMicrophone();
        resetAudioState();
        return;
      }

      // Handle input audio events
      if (event.type === "input_audio_buffer.speech_started") {
        console.log("[USER AUDIO] Speech started - User is speaking");
        setIsListening(true);
        setIsUserSpeaking(true);
        setLiveTranscript("");
        setRealtimeWords([]);
        setCurrentWord("");

        // Start real-time speech recognition for live transcription
        if (speechRecognitionRef.current && !isAssistantSpeaking) {
          try {
            speechRecognitionRef.current.start();
            console.log(
              "🎤 Started real-time speech recognition for live transcription",
            );
          } catch (e) {
            console.log("Speech recognition already running or error:", e);
          }
        }
        return;
      }

      if (event.type === "input_audio_buffer.speech_stopped") {
        console.log("[USER AUDIO] Speech stopped - User finished speaking");
        setIsListening(false);
        setIsUserSpeaking(false);

        // Stop real-time speech recognition
        if (speechRecognitionRef.current) {
          speechRecognitionRef.current.stop();
          console.log("🛑 Stopped real-time speech recognition");
        }

        // Clear live transcription after a delay
        setTimeout(() => {
          setLiveTranscript("");
          setRealtimeWords([]);
          setCurrentWord("");
          interimResultRef.current = "";
        }, 2000);
        return;
      }

      // Handle input audio transcription events
      if (
        event.type === "conversation.item.input_audio_transcription.completed"
      ) {
        console.log("[TRANSCRIPTION] User speech completed:", event.transcript);
        if (event.transcript && event.transcript.trim()) {
          const userFinalTranscript = event.transcript.trim();
          setLiveTranscript("");

          const userMsg = { role: "user", content: userFinalTranscript };
          setConversation((prev) => [...prev, userMsg]);
          console.log(
            "✅ Added user message to conversation:",
            userFinalTranscript,
          );
        }
        return;
      }

      // Handle live transcription updates
      if (event.type === "conversation.item.input_audio_transcription.delta") {
        console.log("[TRANSCRIPTION] Live delta:", event.delta);
        if (event.delta) {
          setLiveTranscript((prev) => prev + event.delta);
        }
        return;
      }

      // Handle assistant transcript events
      if (event.type === "response.audio_transcript.delta") {
        console.log("[AI TRANSCRIPT] Delta received");
        if (currentAssistantText === "") {
          console.log("🔇 First AI transcript delta - Ensuring mic is muted");
          setIsAssistantSpeaking(true);
          muteMicrophone();
        }
        setCurrentAssistantText((prev) => prev + event.delta);
        return;
      }

      if (event.type === "response.audio_transcript.done") {
        console.log("[AI TRANSCRIPT] Complete:", event.transcript);
        if (event.transcript && event.transcript.trim()) {
          const finalTranscript = event.transcript.trim();
          const assistantMsg = { role: "assistant", content: finalTranscript };
          setConversation((prev) => [...prev, assistantMsg]);
          console.log("✅ Added AI message to conversation:", finalTranscript);

          // Check for member transition
          const lower = finalTranscript.toLowerCase();
          if (
            lower.includes("thanks") ||
            lower.includes("moving to the next member") ||
            lower.includes("next person")
          ) {
            console.log("🔄 Detected member transition in AI response");
            handleMemberTransition();
          }
        }
        setCurrentAssistantText("");

        // Mark transcript as complete and check for unmute
        audioStateRef.current.isTranscriptComplete = true;
        checkAndUnmuteMicrophone(
          "response.audio_transcript.done",
          event.response_id,
        );
        return;
      }

      // Handle rate limits
      if (event.type === "rate_limits.updated") {
        console.log("[RATE LIMITS] Updated:", event.rate_limits);
        return;
      }

      // Handle additional events
      if (event.type === "response.content_part.done") {
        console.log("[CONTENT PART] Done - Content part completed");
        return;
      }

      if (event.type === "response.output_item.done") {
        console.log("[OUTPUT ITEM] Done - Output item completed");
        return;
      }

      // Log unhandled events for debugging
      console.log("⚠️ Unhandled event type:", event.type);
    } catch (error) {
      console.error("❌ Error handling server event:", error);
    }
  };

  const handleMemberTransition = () => {
    const nextIndex = memberIndex + 1;
    if (nextIndex < members.length) {
      setMemberIndex(nextIndex);
    }
  };

  const monitorAudioLevels = () => {
    if (!analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const frequencyData = new Uint8Array(bufferLength);

    const checkAudioLevel = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      analyserRef.current.getByteTimeDomainData(frequencyData);

      // Enhanced volume calculation for headphones
      let sum = 0;
      let peakLevel = 0;

      // Focus on mid-frequency range where speech occurs (300Hz-3400Hz)
      const speechStartBin = Math.floor((300 / (48000 / 2)) * bufferLength);
      const speechEndBin = Math.floor((3400 / (48000 / 2)) * bufferLength);

      for (let i = speechStartBin; i < speechEndBin; i++) {
        sum += dataArray[i];
        peakLevel = Math.max(peakLevel, dataArray[i]);
      }

      const speechRange = speechEndBin - speechStartBin;
      const average = sum / speechRange;

      // Use RMS calculation for more accurate speech detection
      let rms = 0;
      for (let i = 0; i < frequencyData.length; i++) {
        const sample = (frequencyData[i] - 128) / 128;
        rms += sample * sample;
      }
      rms = Math.sqrt(rms / frequencyData.length);

      // Combine average and RMS for better headphone speech detection
      const combinedLevel = (average / 255) * 0.7 + rms * 0.3;

      // Adaptive noise gate based on recent background levels
      const adaptiveNoiseGate = isAssistantSpeaking ? 0.05 : 0.15; // Lower when AI speaking
      const adjustedVolume =
        combinedLevel > adaptiveNoiseGate ? combinedLevel : 0;

      setVolumeLevel(Math.min(adjustedVolume * 150, 100)); // Amplify valid speech

      if (!isStopped) {
        requestAnimationFrame(checkAudioLevel);
      }
    };

    checkAudioLevel();
  };

  const muteMicrophone = () => {
    if (trackRef.current && trackRef.current.readyState === "live") {
      trackRef.current.enabled = false;
      console.log("🔇 MICROPHONE MUTED - AI is speaking, user mic disabled");

      // Stop real-time speech recognition when AI is speaking
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch (e) {
          console.log("Speech recognition already stopped or error:", e);
        }
        setIsUserSpeaking(false);
        setRealtimeWords([]);
        setCurrentWord("");
        setLiveTranscript("");
        interimResultRef.current = "";
      }

      // Apply noise gate to minimize headphone bleed without suspending context
      if (noiseSuppressionRef.current) {
        noiseSuppressionRef.current.gain.setValueAtTime(
          0.01,
          audioContextRef.current?.currentTime || 0,
        );
        console.log(
          "🔇 Applied aggressive noise gate for headphone protection",
        );
      }
    } else {
      console.warn(
        "⚠️ Cannot mute microphone: track not available or not live",
      );
      console.log(
        "Track state:",
        trackRef.current
          ? {
              readyState: trackRef.current.readyState,
              enabled: trackRef.current.enabled,
              kind: trackRef.current.kind,
              label: trackRef.current.label,
            }
          : "No track",
      );
    }
  };

  const unmuteMicrophone = () => {
    if (trackRef.current && trackRef.current.readyState === "live") {
      trackRef.current.enabled = true;
      console.log("🎤 MICROPHONE UNMUTED - User can speak now");

      // Restore normal noise gate level
      if (noiseSuppressionRef.current && audioContextRef.current) {
        noiseSuppressionRef.current.gain.setValueAtTime(
          0.2,
          audioContextRef.current.currentTime,
        );
        console.log("🎤 Restored normal noise gate level for user speech");
      }
    } else {
      console.warn(
        "⚠️ Cannot unmute microphone: track not available or not live",
      );
      console.log(
        "Track state:",
        trackRef.current
          ? {
              readyState: trackRef.current.readyState,
              enabled: trackRef.current.enabled,
              kind: trackRef.current.kind,
              label: trackRef.current.label,
            }
          : "No track",
      );
    }
  };

  const startConversation = async () => {
    if (!projectDetails || members.length === 0) {
      alert("Please select a project with members first.");
      return;
    }

    setIsStopped(false);
    setMemberIndex(0);
    setConversation([]);
    setShowDownloadButton(false); // Hide download button when starting new conversation

    try {
      // Setup WebRTC
      await setupWebRTC();

      // Create offer
      const offer = await pcRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      await pcRef.current.setLocalDescription(offer);

      // Send to backend
      const response = await fetch(`${BACKEND_URL}/webrtc-signal/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sdp: pcRef.current.localDescription.sdp,
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
      await pcRef.current.setRemoteDescription({
        type: "answer",
        sdp: data.sdp,
      });

      // Wait for session configuration and auto-start
      await new Promise((resolve) => {
        const checkSession = () => {
          if (sessionConfigured) {
            resolve();
          } else {
            setTimeout(checkSession, 100);
          }
        };
        checkSession();
      });

      console.log("Session configured, AI will auto-start the conversation");
      setIsListening(true);
    } catch (error) {
      console.error("Error starting conversation:", error);
      cleanupWebRTC();
    }
  };

  const downloadExcel = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/download-excel/`);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'standup_meetings.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      console.log("✅ Excel file downloaded successfully");
    } catch (error) {
      console.error("❌ Download error:", error);
      alert("Failed to download Excel file. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  const endConversation = async () => {
    setIsStopped(true);
    setIsListening(false);

    // Send final data to backend
    try {
      const res = await fetch(`${BACKEND_URL}/end/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProject,
          conversation: conversation.filter((msg) => msg.role !== "system"),
        }),
      });

      const data = await res.json();
      if (data.message) {
        setConversation([]);
        setLiveTranscript("");
        setShowDownloadButton(true); // Show download button after successful save
        console.log("✅ Standup data saved successfully - Download now available");
      }
    } catch (err) {
      console.error("Save Error:", err);
    }

    cleanupWebRTC();
  };

  const cleanupWebRTC = () => {
    // Clear any pending unmute timeouts
    if (audioStateRef.current.unmuteTimeoutId) {
      clearTimeout(audioStateRef.current.unmuteTimeoutId);
      audioStateRef.current.unmuteTimeoutId = null;
    }

    // Reset audio state
    resetAudioState();

    // Stop tracks
    if (trackRef.current) {
      trackRef.current.stop();
      trackRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Close data channel
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }

    // Close peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setSessionConfigured(false);
    setIsAssistantSpeaking(false);
    setCurrentAssistantText("");
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 120px)",
        gap: 2,
      }}
    >
      {/* Header with Title and Controls */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            background: "linear-gradient(45deg, #6c5ce7 30%, #00cec9 90%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Standup Assistant
        </Typography>

        <Box sx={{ display: "flex", gap: 1 }}>
          <IconButton
            color="primary"
            onClick={startConversation}
            disabled={
              !selectedProject || (!isStopped && conversation.length > 0)
            }
            sx={{ mr: 1 }}
          >
            <PlayArrow fontSize="large" />
          </IconButton>

          <IconButton
            color="error"
            onClick={endConversation}
            disabled={conversation.length === 0 || isStopped}
            sx={{
              bgcolor: "error.light",
              "&:hover": { bgcolor: "error.main", color: "white" },
            }}
          >
            <Stop fontSize="large" />
          </IconButton>

          {showDownloadButton && (
            <IconButton
              color="success"
              onClick={downloadExcel}
              disabled={isDownloading}
              sx={{
                bgcolor: "success.light",
                "&:hover": { bgcolor: "success.main", color: "white" },
                ml: 1,
              }}
              title="Download Standup Excel File"
            >
              <DownloadIcon fontSize="large" />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Combined Project and Conversation Container */}
      <Box
        sx={{
          display: "flex",
          gap: 2,
          flexGrow: 1,
          overflow: "hidden",
        }}
      >
        {/* Project Box */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 3,
            background: "rgba(255, 255, 255, 0.6)",
            backdropFilter: "blur(5px)",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            width: 300,
            minWidth: 300,
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          {/* Project Selection */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Select Project
            </Typography>
            <Box
              sx={{
                position: "relative",
                "&:after": {
                  content: '"▼"',
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  color: "primary.main",
                },
              }}
            >
              <select
                onChange={handleProjectSelect}
                value={selectedProject || ""}
                style={{
                  width: "100%",
                  padding: "8px 32px 8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #6c5ce7",
                  backgroundColor: "rgba(255, 255, 255, 0.8)",
                  appearance: "none",
                  outline: "none",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                <option value="" disabled>
                  Select a project
                </option>
                {projectList.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.project_name}
                  </option>
                ))}
              </select>
            </Box>
          </Box>

          {/* Team Members Section */}
          <Box
            sx={{
              flexGrow: 1,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                mb: 1,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <PeopleIcon fontSize="small" /> Team Members
            </Typography>

            {projectDetails ? (
              <Box
                sx={{
                  flexGrow: 1,
                  overflow: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  pr: 1,
                }}
              >
                {projectDetails.employees.map((emp, index) => (
                  <Box
                    key={emp.id}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      p: 1,
                      borderRadius: 1,
                      bgcolor:
                        index === memberIndex
                          ? "primary.light"
                          : "background.paper",
                      boxShadow: 1,
                      border: index === memberIndex ? "2px solid" : "none",
                      borderColor:
                        index === memberIndex ? "primary.main" : "transparent",
                    }}
                  >
                    <Avatar
                      sx={{
                        bgcolor:
                          index === memberIndex
                            ? "primary.main"
                            : "secondary.main",
                        width: 32,
                        height: 32,
                      }}
                    >
                      {emp.employee_name.charAt(0)}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {emp.employee_name}
                        {index === memberIndex && " (Current)"}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary" }}
                      >
                        {emp.role} • {emp.employee_id}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Box
                sx={{
                  flexGrow: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  color: "text.secondary",
                }}
              >
                <Typography variant="body1" sx={{ mb: 1 }}>
                  No project selected
                </Typography>
                <Typography variant="body2">
                  Please select a project to view team members
                </Typography>
              </Box>
            )}
          </Box>
        </Paper>

        {/* Conversation Section */}
        <Box
          sx={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          <ConversationDisplay conversation={conversation} />

          {(isListening || liveTranscript || isUserSpeaking) && (
            <Box sx={{ mt: 2 }}>
              <LiveTranscript
                transcript={
                  liveTranscript || (isListening ? "Listening..." : "")
                }
                realtimeWords={realtimeWords}
                currentWord={currentWord}
                isUserSpeaking={isUserSpeaking}
              />
              <LinearProgress
                variant="determinate"
                value={Math.min(volumeLevel, 100)}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  mt: 1,
                  background: isUserSpeaking
                    ? "linear-gradient(90deg, #00b894 0%, #00cec9 100%)"
                    : "linear-gradient(90deg, #6c5ce7 0%, #00cec9 100%)",
                }}
              />
            </Box>
          )}
        </Box>
      </Box>

      {/* Microphone Status */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 2,
          pt: 2,
        }}
      >
        {isListening ? (
          <AnimatedButton
            color={isAssistantSpeaking ? "error" : "primary"}
            variant="contained"
            disabled={isAssistantSpeaking}
          >
            <Mic fontSize="large" />
          </AnimatedButton>
        ) : (
          <FloatingButton
            color="primary"
            variant="contained"
            disabled={isStopped || !sessionConfigured}
          >
            <Mic fontSize="large" />
          </FloatingButton>
        )}

        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {isAssistantSpeaking && "🎙️ AI is speaking - Microphone muted"}
          {isListening && !isAssistantSpeaking && "👂 Listening - Speak now"}
          {!isListening &&
            !isAssistantSpeaking &&
            sessionConfigured &&
            "⏸️ Your turn to speak"}
          {showDownloadButton && !isListening && "📊 Standup complete - Download Excel file available"}
        </Typography>
      </Box>
    </Box>
  );
}

export default VoiceAssistant;