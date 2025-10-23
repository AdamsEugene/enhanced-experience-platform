# Chatbot Wizard API Documentation

## Overview

The Chatbot Wizard API provides a simplified 2-step process for auto-generating chatbot configurations using AI. The system analyzes user descriptions, asks clarifying questions if needed, and generates complete chatbot configurations.

## Base URL

```
http://localhost:3007/api
```

---

## Endpoints

### 1. Step 1: Analyze Chatbot Description

**Endpoint:** `POST /api/chatbot-wizard/step1`

**Description:** Submit initial chatbot description. The AI will analyze if enough information is provided or if follow-up questions are needed.

**Request Body:**
```json
{
  "userDescription": "I want a customer support chatbot for my e-commerce store"
}
```

**Response (Needs More Info):**
```json
{
  "success": true,
  "sessionId": "chatbot-session-1234567890-abc123",
  "needsMoreInfo": true,
  "questions": [
    "What types of products does your e-commerce store sell?",
    "What tone would you like the chatbot to have (friendly, professional, casual)?",
    "What are the most common customer support issues you want the chatbot to handle?"
  ],
  "questionsText": "1. What types of products does your e-commerce store sell?\n2. What tone would you like the chatbot to have (friendly, professional, casual)?\n3. What are the most common customer support issues you want the chatbot to handle?",
  "message": "I have a few questions to better understand your chatbot needs."
}
```

**Response (Enough Info - Rare):**
```json
{
  "success": true,
  "sessionId": "chatbot-session-1234567890-abc123",
  "needsMoreInfo": false,
  "message": "Great! We have enough information to generate your chatbot."
}
```

**Error Response:**
```json
{
  "error": "userDescription is required and must be a non-empty string"
}
```

---

### 2. Step 2: Generate Chatbot Configuration

**Endpoint:** `POST /api/chatbot-wizard/step2`

**Description:** Submit answers to follow-up questions and generate the final chatbot configuration.

**Request Body:**
```json
{
  "sessionId": "chatbot-session-1234567890-abc123",
  "answers": "We sell clothing and accessories. I'd like a friendly and helpful tone. The most common issues are order tracking, returns/exchanges, and sizing questions."
}
```

**Response:**
```json
{
  "success": true,
  "chatbotId": "chatbot-1234567890-def456",
  "message": "Your chatbot has been successfully created!",
  "chatLink": "https://chat.example.com/chatbot-1234567890-def456",
  "phoneNumber": "+1 (555) 123-4567",
  "chatbotConfig": {
    "id": "chatbot-1234567890-def456",
    "name": "Fashion Store Support Assistant",
    "description": "A friendly customer support chatbot for an e-commerce clothing and accessories store, helping customers with order tracking, returns, and sizing questions.",
    "personality": "Friendly, helpful, and patient with a warm, approachable tone",
    "capabilities": [
      "Order tracking and status updates",
      "Returns and exchange policy guidance",
      "Sizing recommendations and fit advice",
      "Product availability inquiries",
      "General customer support"
    ],
    "conversationFlow": {
      "greeting": "Hi there! 👋 I'm here to help you with your order, sizing questions, or any other concerns. How can I assist you today?",
      "commonQuestions": [
        {
          "question": "Where is my order?",
          "answer": "I can help you track your order! Please provide your order number, and I'll check the status for you."
        },
        {
          "question": "How do I return an item?",
          "answer": "We accept returns within 30 days of purchase. Items must be unworn with tags attached. You can initiate a return through your account or I can guide you through the process."
        },
        {
          "question": "What size should I order?",
          "answer": "I can help with sizing! Could you tell me which item you're interested in? Each product page has a size guide, and I can provide specific recommendations."
        }
      ],
      "fallbackResponse": "I'm not quite sure I understand. Could you rephrase that? I'm here to help with orders, returns, sizing, and general questions about our products.",
      "escalationTriggers": [
        "Complaint about defective product",
        "Request for refund beyond policy",
        "Complex order issues",
        "Account security concerns"
      ]
    },
    "createdAt": "2025-10-23T12:34:56.789Z"
  }
}
```

**Error Response (Invalid Session):**
```json
{
  "error": "Session not found or expired",
  "details": "Please start over from step 1"
}
```

---

### 3. Get Chatbot by ID

**Endpoint:** `GET /api/chatbots/:id`

**Description:** Retrieve a specific chatbot configuration by its ID.

**Response:**
```json
{
  "id": "chatbot-1234567890-def456",
  "name": "Fashion Store Support Assistant",
  "description": "A friendly customer support chatbot...",
  "personality": "Friendly, helpful, and patient...",
  "capabilities": [...],
  "conversationFlow": {...},
  "createdAt": "2025-10-23T12:34:56.789Z"
}
```

**Error Response:**
```json
{
  "error": "Chatbot not found"
}
```

---

### 4. List All Chatbots

**Endpoint:** `GET /api/chatbots`

**Description:** Get a list of all generated chatbots.

**Response:**
```json
{
  "chatbots": [
    {
      "id": "chatbot-1234567890-def456",
      "name": "Fashion Store Support Assistant",
      "description": "A friendly customer support chatbot...",
      "createdAt": "2025-10-23T12:34:56.789Z",
      "capabilities": [
        "Order tracking and status updates",
        "Returns and exchange policy guidance",
        "Sizing recommendations and fit advice"
      ]
    }
  ],
  "total": 1
}
```

---

## Complete Flow Example

### Step 1: User describes what they want

```bash
curl -X POST http://localhost:3007/api/chatbot-wizard/step1 \
  -H "Content-Type: application/json" \
  -d '{
    "userDescription": "I need a chatbot for my restaurant to handle reservations"
  }'
```

### Step 2: AI asks clarifying questions

Response includes:
- Session ID
- 1-3 clarifying questions
- Questions formatted as text

### Step 3: User answers questions

```bash
curl -X POST http://localhost:3007/api/chatbot-wizard/step2 \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "chatbot-session-1234567890-abc123",
    "answers": "Italian restaurant with 20 tables. We want a professional but friendly tone. The chatbot should handle reservations, answer menu questions, and provide directions."
  }'
```

### Step 4: Receive chatbot configuration

Response includes:
- Complete chatbot configuration
- Chat link
- Phone number for voice access

---

## Key Features

✅ **2-Step Process:** Simple, streamlined workflow  
✅ **AI-Powered Analysis:** Claude determines if more info is needed  
✅ **Max 3 Questions:** Never overwhelms users with too many questions  
✅ **Single Textarea:** Simple answer format, no complex forms  
✅ **Conditional Logic:** Skip Step 2 if enough info provided (rare)  
✅ **Session Management:** Secure session tracking between steps  
✅ **Complete Configurations:** Production-ready chatbot configs

---

## Technical Notes

- **AI Model:** Uses GPT-4o for analysis and generation
- **Session Storage:** In-memory (sessions cleared after Step 2)
- **Validation:** Comprehensive request validation on all endpoints
- **Error Handling:** Detailed error messages for debugging
- **Phone Number:** Auto-generated demo phone number (format: +1 (XXX) XXX-XXXX)
- **Chat Link:** Auto-generated link based on chatbot ID

---

## Future Enhancements

- Iterative questioning (ask follow-up questions if needed)
- Individual Q&A fields instead of single textarea
- Voice input for Step 1 (click-to-talk)
- Real phone number integration
- Persistent storage for chatbot configurations
- Chatbot editing and versioning
- Analytics and usage tracking

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200` - Success
- `400` - Bad Request (invalid input)
- `404` - Not Found (session/chatbot not found)
- `500` - Internal Server Error

Error responses include:
```json
{
  "error": "Error message",
  "details": "Additional context (optional)"
}
```

