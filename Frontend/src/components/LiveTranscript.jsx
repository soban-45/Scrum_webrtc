
import React from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Slide,
  Chip
} from '@mui/material';
import { Mic as MicIcon, RecordVoiceOver } from '@mui/icons-material';

function LiveTranscript({ transcript, realtimeWords = [], currentWord = '', isUserSpeaking = false }) {
  const hasTranscript = transcript && transcript.trim() && transcript !== "Listening...";
  const hasRealtimeWords = realtimeWords.length > 0;

  return (
    <Slide direction="up" in={!!transcript || isUserSpeaking} mountOnEnter unmountOnExit>
      <Paper elevation={3} sx={{
        p: 2,
        borderRadius: 3,
        background: hasTranscript 
          ? 'linear-gradient(135deg, #6c5ce7 0%, #00cec9 100%)'
          : isUserSpeaking
          ? 'linear-gradient(135deg, #00b894 0%, #00cec9 100%)'
          : 'linear-gradient(135deg, #74b9ff 0%, #0984e3 100%)',
        color: 'white',
        minHeight: '80px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {isUserSpeaking ? (
            <RecordVoiceOver sx={{ 
              mr: 1, 
              animation: 'pulse 1s infinite',
              '@keyframes pulse': {
                '0%': { transform: 'scale(1)', opacity: 1 },
                '50%': { transform: 'scale(1.1)', opacity: 0.8 },
                '100%': { transform: 'scale(1)', opacity: 1 }
              }
            }} />
          ) : (
            <MicIcon sx={{ 
              mr: 1, 
              animation: hasTranscript ? 'none' : 'pulse 2s infinite',
              '@keyframes pulse': {
                '0%': { transform: 'scale(1)', opacity: 1 },
                '50%': { transform: 'scale(1.05)', opacity: 0.7 },
                '100%': { transform: 'scale(1)', opacity: 1 }
              }
            }} />
          )}
          <Typography variant="subtitle2">
            {hasTranscript ? 'You said:' : isUserSpeaking ? 'Speaking...' : 'Listening...'}
          </Typography>
        </Box>

        {/* Real-time word-by-word display */}
        {hasRealtimeWords && isUserSpeaking && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" sx={{ opacity: 0.8, mb: 1, display: 'block' }}>
              Live:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {realtimeWords.map((word, index) => (
                <Chip
                  key={`${word}-${index}`}
                  label={word}
                  size="small"
                  sx={{
                    backgroundColor: index === realtimeWords.length - 1 
                      ? 'rgba(255, 255, 255, 0.9)' 
                      : 'rgba(255, 255, 255, 0.7)',
                    color: index === realtimeWords.length - 1 ? '#6c5ce7' : '#333',
                    animation: index === realtimeWords.length - 1 
                      ? 'wordPop 0.3s ease-out' : 'none',
                    transform: index === realtimeWords.length - 1 
                      ? 'scale(1.05)' : 'scale(1)',
                    '@keyframes wordPop': {
                      '0%': { transform: 'scale(0.8)', opacity: 0.5 },
                      '50%': { transform: 'scale(1.1)', opacity: 0.8 },
                      '100%': { transform: 'scale(1.05)', opacity: 1 }
                    }
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Final transcript display */}
        <Typography variant="body1" sx={{ 
          fontStyle: hasTranscript ? 'normal' : 'italic',
          minHeight: '1.5em',
          fontWeight: hasTranscript ? 500 : 400,
          opacity: hasTranscript ? 1 : 0.8
        }}>
          {transcript || (isUserSpeaking ? 'Keep speaking...' : 'Speak now...')}
        </Typography>

        {/* Sound wave animation when user is speaking */}
        {isUserSpeaking && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 8,
              right: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5
            }}
          >
            {[1, 2, 3, 4, 5].map((bar) => (
              <Box
                key={bar}
                sx={{
                  width: 3,
                  height: 16,
                  backgroundColor: 'rgba(255, 255, 255, 0.6)',
                  borderRadius: 2,
                  animation: `soundWave 1.${bar}s ease-in-out infinite`,
                  '@keyframes soundWave': {
                    '0%, 100%': { height: 4 },
                    '50%': { height: 16 }
                  }
                }}
              />
            ))}
          </Box>
        )}
      </Paper>
    </Slide>
  );
}

export default LiveTranscript;
