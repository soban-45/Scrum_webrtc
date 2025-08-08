import React from 'react';
import { Container, CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import VoiceAssistant from './components/VoiceAssistant';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#6c5ce7',
    },
    secondary: {
      main: '#00cec9',
    },
    background: {
      default: '#f5f6fa',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
  },
  shape: {
    borderRadius: 12,
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <VoiceAssistant />
      </Container>
    </ThemeProvider>
  );
}

export default App;