# Chat Feature PRD

## Overview

This document outlines the requirements and specifications for implementing a real-time chat feature in our application.

## Goals

- Provide users with basic text-based chat functionality
- Start with a free solution that can scale with user growth
- Ensure cross-platform compatibility (desktop and mobile)
- Integrate seamlessly with the current interface design

## Technical Implementation

### Backend: Firebase Realtime Database

We will leverage our existing Firebase infrastructure to implement chat functionality.

#### Data Structure 
/chats
    /chatRoom1
        /messages
            /message1
                text: "Hello there"
                senderId: "user123"
                timestamp: 1699542367890
            /message2
                text: "How are you?"
                senderId: "user456"
                timestamp: 1699542378123
    /chatRoom2
        /messages

#### Message Storage Strategy

**Message Limits:**
- Strict limit of 100 messages per chat room 
- When a new message is added that exceeds this limit, the oldest message will be automatically removed
- This approach will be implemented from the beginning to control database size
- Monitor database size against Firebase free tier limits (1GB storage)

**Implementation Method:**
```javascript
// When adding a new message
firebase.database().ref(`chats/${chatId}/messages`).push(newMessage)
  .then(() => {
    // Query to find oldest messages beyond the 100 message limit
    return firebase.database().ref(`chats/${chatId}/messages`)
      .orderByChild('timestamp')
      .limitToFirst(totalCount - 100) // If over limit
      .once('value');
  })
  .then((snapshot) => {
    // Remove oldest messages
    const updates = {};
    snapshot.forEach(child => {
      updates[child.key] = null;
    });
    return firebase.database().ref(`chats/${chatId}/messages`).update(updates);
  });
```

**Future Enhancement (Phase 3):**
- Implement a scheduled Firebase Cloud Function that runs daily
- Function will remove all messages older than 5 days, regardless of count
- This adds an additional layer of storage management beyond the 100-message limit


#### Security Rules

- Messages should only be readable by participants in the chat
- Users should only be able to send messages as themselves
- Basic profanity filtering should be implemented

## UI Design

1. Expandable Chat Widget 

Collapsed:                  Expanded:
┌────────────────────┐      ┌────────────────────┐
│                    │      │                    │
│                    │      │                    │
│  Main Application  │      │  Main Application  │
│                    │      │                    │
│                    │      │                    │
│                    │      │────────────────────│
│                    │      │ Chat Header        │
│                    │      │────────────────────│
│                    │      │ Message List       │
│                    │      │                    │
│                    │      │────────────────────│
│                    │      │ Input Area         │
└────────────────────┘      └────────────────────┘
    Chat Button (◯)


┌──────────────────────┐     ┌──────────────────────┐
│ Sender's Message     │     │                      │
│                      │     │                      │
│                      │     │     Your Message     │
└──────────────────────┘     └──────────────────────┘
Time                           Time

2. Message Bubbles
┌──────────────────────┐     ┌──────────────────────┐
│ Sender's Message     │     │                      │
│                      │     │                      │
│                      │     │     Your Message     │
└──────────────────────┘     └──────────────────────┘
Time                           Time

- Different colors for sent vs. received
- Subtle rounded corners
- Timestamps below messages

3. Input Area
┌─────────────────────────────────┬─────┐
│ Type a message...               │ ▶  │
└─────────────────────────────────┴─────┘
- Simple, clean input field
- Clear send button
- Consistent padding around text

### Core Components

1. **Message List Area**
   - Auto-scrolling message container
   - Visual distinction between sent and received messages
   - Timestamp indicators
   - Loading states for message history

2. **Input Area**
   - Fixed position at bottom of chat
   - Text input field with send button
   - Consistent height across devices

3. **Chat Header**
   - Room/conversation name
   - Participant information
   - Mobile: Navigation controls

## UI Design

#### Expandable Chat Widget

We will implement an expandable chat widget that works consistently across both desktop and mobile platforms:

**Collapsed State:**
- Persistent chat button/bubble fixed to bottom-right corner of screen
- Unread message counter/indicator when appropriate
- Minimal footprint on main application UI
- Consistent position across responsive breakpoints

**Expanded State (Desktop):**
- Expands to approximately 30-40% of screen width
- Height extends to 60-80% of viewport height
- Main application remains visible and usable
- Semi-transparent backdrop optional to increase focus on chat

**Expanded State (Mobile):**
- Expands to cover 90-100% of screen width
- Height extends to 50-70% of viewport height
- Main application content remains partially visible
- Easy collapse handle or button

**Transition:**
- Smooth animation between collapsed and expanded states
- Gesture support on mobile (swipe to expand/collapse)
- Click/tap to toggle on button or header

**Notification States:**
- Visual indicator on collapsed chat button for new messages
- Potential sound notification (user-configurable)

### Responsive Design

**Breakpoints:**
- Small mobile: 320-480px
- Large mobile/Small tablet: 481-767px
- Tablet: 768-1023px
- Desktop: 1024px+

**Adaptation Strategy:**
- Consistent widget behavior across devices
- Expanded size proportional to screen size
- Widget position adjusts for bottom navigation on mobile
- Button size increases for touch targets on mobile

## User Experience

### Message Interaction

- New messages appear immediately without refresh
- Unread message indicators
- Auto-scroll to bottom for new messages
- Manual scroll up for message history

### Notifications

- In-app notifications for new messages
- Visual indicator in navigation when chat is not active

## Accessibility Requirements

- ARIA roles for chat components
- Keyboard navigation support
- Screen reader compatibility for messages
- Sufficient color contrast for all UI elements

## Performance Considerations

- Virtualized lists for long chat histories
- Pagination/infinite scroll for message loading
- Optimistic UI updates for sent messages
- Offline support and message queuing

## Implementation Phases

### Phase 1: Core Chat Functionality
- Basic message sending and receiving
- Simple UI implementation
- Firebase Realtime Database integration

### Phase 2: UI Refinement
- Responsive design implementation
- Mobile experience optimization
- Animation and interaction polish

### Phase 3: Performance Optimization
- Message pagination
- Storage optimization
- Load testing and performance tuning

### Phase 4: Advanced Features (Future Consideration)
- Read receipts
- Typing indicators
- Media sharing capabilities

## Success Metrics

- Active chat users
- Messages sent per session
- Chat engagement time
- User satisfaction with chat functionality

## Limitations

- Basic text messages only (no media sharing initially)
- Limited chat history retention
- Subject to Firebase free tier limitations

## Future Expansion Possibilities

- Integration with notification system
- Group chat functionality
- Advanced message formatting
- Media/file sharing capabilities