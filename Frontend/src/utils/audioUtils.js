let audioContext = null;
let analyser = null;
let mediaRecorder = null;
let stream = null;
let recognition = null;
let silenceTimer = null;

export const cleanupResources = async () => {
  if (silenceTimer) clearTimeout(silenceTimer);

  if (recognition) recognition.stop();
  if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  if (audioContext) await audioContext.close();
};

export const startRecording = async ({ onVolumeChange, onSpeechEnd, onTranscriptUpdate, chunksRef }) => {
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { noiseSuppression: true, echoCancellation: true }
  });

  chunksRef.current = [];

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);
  analyser.fftSize = 512;

  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => chunksRef.current.push(e.data);
  mediaRecorder.onstop = () => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    onSpeechEnd(blob);
  };

  // Setup SpeechRecognition for live transcript
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (!event.results[i].isFinal) interim += transcript;
        else onTranscriptUpdate(transcript);
      }
      onTranscriptUpdate(interim);
    };

    recognition.start();
  }

  const start = () => {
    mediaRecorder.start();
    monitorVolume({ onVolumeChange });
  };

  return { start, cleanup: cleanupResources };
};

export const monitorVolume = ({ onVolumeChange }) => {
  if (!analyser) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  const checkVolume = () => {
    analyser.getByteFrequencyData(dataArray);
    const volume = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
    onVolumeChange(volume);

    if (volume > 20) {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        if (mediaRecorder?.state === 'recording') {
          mediaRecorder.stop();
          cleanupResources();
        }
      }, 2000);
    }

    if (mediaRecorder?.state === 'recording') {
      requestAnimationFrame(checkVolume);
    }
  };

  checkVolume();
};
