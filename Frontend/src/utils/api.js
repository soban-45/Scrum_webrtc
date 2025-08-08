const OPENAI_API_KEY = "your-key-here";

export const startTTS = async (text) => {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: "echo",
      input: text
    })
  });
  const blob = await res.blob();
  return URL.createObjectURL(blob);
};

export const transcribeAudio = async (blob) => {
  const formData = new FormData();
  formData.append('file', blob, 'recording.webm');
  formData.append('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData
  });

  const data = await res.json();
  return data.text;
};

export const sendToGPT = async (messages, audioRef) => {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages,
      temperature: 0.7
    })
  });

  const data = await res.json();
  const reply = data.choices[0].message.content;
  const audioUrl = await startTTS(reply);
  audioRef.current.src = audioUrl;
  audioRef.current.play();
  return reply;
};
