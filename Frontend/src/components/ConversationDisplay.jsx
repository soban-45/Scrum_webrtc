import React from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Avatar, 
  List, 
  ListItem, 
  ListItemAvatar, 
  ListItemText 
} from '@mui/material';
import { 
  Person as UserIcon, 
  SmartToy as AssistantIcon 
} from '@mui/icons-material';

const MessageItem = ({ message }) => {
  return (
    <ListItem alignItems="flex-start" sx={{
      px: 0,
      py: 1,
    }}>
      <ListItemAvatar sx={{ minWidth: 40 }}>
        <Avatar sx={{ 
          bgcolor: message.role === 'assistant' ? 'primary.main' : 'secondary.main',
          width: 32, 
          height: 32 
        }}>
          {message.role === 'assistant' ? (
            <AssistantIcon fontSize="small" />
          ) : (
            <UserIcon fontSize="small" />
          )}
        </Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={
          <Typography variant="subtitle2" color="text.primary">
            {message.role === 'assistant' ? 'Assistant' : 'You'}
          </Typography>
        }
        secondary={
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ wordBreak: 'break-word' }}
          >
            {message.content}
          </Typography>
        }
      />
    </ListItem>
  );
};

function ConversationDisplay({ conversation }) {
  return (
    <Paper elevation={0} sx={{
      flexGrow: 1,
      overflow: 'auto',
      p: 2,
      borderRadius: 3,
      background: 'rgba(255, 255, 255, 0.8)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
    }}>
      {conversation.filter(msg => msg.role !== 'system').length === 0 ? (
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          textAlign: 'center',
          color: 'text.secondary',
        }}>
          <Typography variant="h6">No messages yet</Typography>
          <Typography variant="body2">Start the conversation by clicking the microphone</Typography>
        </Box>
      ) : (
        <List sx={{ width: '100%' }}>
          {conversation.filter(msg => msg.role !== 'system').map((message, index) => (
            <MessageItem key={index} message={message} />
          ))}
        </List>
      )}
    </Paper>
  );
}

export default ConversationDisplay;