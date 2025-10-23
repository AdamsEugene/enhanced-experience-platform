# Chatbot Wizard API - Postman Quick Reference

Base URL: `http://localhost:3007/api`

---

## 1. Step 1: Analyze Chatbot Description

**Endpoint:** `POST http://localhost:3007/api/chatbot-wizard/step1`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "userDescription": "I want a customer support chatbot for my online bookstore"
}
```

**What it does:** Submits your chatbot idea. AI analyzes it and asks 1-3 follow-up questions if needed.

**Response:** Returns `sessionId` and `questions` array

---

## 2. Step 2: Generate Chatbot

**Endpoint:** `POST http://localhost:3007/api/chatbot-wizard/step2`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "sessionId": "PASTE_SESSION_ID_FROM_STEP_1_HERE",
  "answers": "We sell fiction and non-fiction books. The tone should be friendly and knowledgeable. The chatbot should help with book recommendations, order tracking, and return policies."
}
```

**What it does:** Submits your answers and generates complete chatbot configuration.

**Response:** Returns complete chatbot config with `chatbotId`, `chatLink`, and `phoneNumber`

---

## 3. Get All Chatbots

**Endpoint:** `GET http://localhost:3007/api/chatbots`

**Headers:** None needed

**Body:** None

**What it does:** Lists all generated chatbots

---

## 4. Get Specific Chatbot

**Endpoint:** `GET http://localhost:3007/api/chatbots/{chatbotId}`

**Example:** `GET http://localhost:3007/api/chatbots/chatbot-1761260840135-38009ead`

**Headers:** None needed

**Body:** None

**What it does:** Gets full details of a specific chatbot

---

## 5. Health Check

**Endpoint:** `GET http://localhost:3007/health`

**Headers:** None needed

**Body:** None

**What it does:** Checks if server is running

---

# Complete Example Flow for Postman

## Test 1: Online Bookstore Chatbot

### Step 1A - Initial Description
```
POST http://localhost:3007/api/chatbot-wizard/step1
```
```json
{
  "userDescription": "I want a customer support chatbot for my online bookstore"
}
```
→ Copy the `sessionId` from response

### Step 1B - Answer Questions
```
POST http://localhost:3007/api/chatbot-wizard/step2
```
```json
{
  "sessionId": "PASTE_SESSION_ID_HERE",
  "answers": "We sell fiction and non-fiction books. The tone should be friendly and knowledgeable. The chatbot should help with book recommendations, order tracking, and return policies."
}
```
→ Copy the `chatbotId` from response

---

## Test 2: Pizza Restaurant Chatbot

### Step 2A - Initial Description
```
POST http://localhost:3007/api/chatbot-wizard/step1
```
```json
{
  "userDescription": "I need a chatbot for my pizza restaurant to take orders"
}
```
→ Copy the `sessionId` from response

### Step 2B - Answer Questions
```
POST http://localhost:3007/api/chatbot-wizard/step2
```
```json
{
  "sessionId": "PASTE_SESSION_ID_HERE",
  "answers": "Target audience is families and young adults. Tone should be friendly and casual. Features needed: menu browsing, take orders with toppings selection, order tracking, and store hours info."
}
```

---

## Test 3: Gym/Fitness Chatbot

### Step 3A - Initial Description
```
POST http://localhost:3007/api/chatbot-wizard/step1
```
```json
{
  "userDescription": "I need a chatbot for my gym to help members with class schedules and membership info"
}
```

### Step 3B - Answer Questions
```
POST http://localhost:3007/api/chatbot-wizard/step2
```
```json
{
  "sessionId": "PASTE_SESSION_ID_HERE",
  "answers": "We have 200 members, mostly 25-45 years old. Professional but motivating tone. The chatbot should show class schedules, help with membership upgrades, answer facility questions, and book personal training sessions."
}
```

---

## Test 4: Hotel Concierge Chatbot

### Step 4A - Initial Description
```
POST http://localhost:3007/api/chatbot-wizard/step1
```
```json
{
  "userDescription": "I want a virtual concierge chatbot for my boutique hotel"
}
```

### Step 4B - Answer Questions
```
POST http://localhost:3007/api/chatbot-wizard/step2
```
```json
{
  "sessionId": "PASTE_SESSION_ID_HERE",
  "answers": "Luxury boutique hotel with 50 rooms. Sophisticated and helpful tone. The chatbot should handle room service orders, provide local recommendations, arrange transportation, and answer facility questions."
}
```

---

# Error Testing

## Test Invalid Session
```
POST http://localhost:3007/api/chatbot-wizard/step2
```
```json
{
  "sessionId": "invalid-session-id",
  "answers": "Some answers"
}
```
**Expected:** 404 error with message "Session not found or expired"

---

## Test Empty Description
```
POST http://localhost:3007/api/chatbot-wizard/step1
```
```json
{
  "userDescription": ""
}
```
**Expected:** 400 error with validation message

---

## Test Missing Fields
```
POST http://localhost:3007/api/chatbot-wizard/step1
```
```json
{}
```
**Expected:** 400 error

---

# Quick Copy-Paste Templates

## Template 1: E-commerce Store
```json
{
  "userDescription": "I need a chatbot for my e-commerce store selling [PRODUCT]"
}
```

## Template 2: Healthcare/Medical
```json
{
  "userDescription": "I want a chatbot for my [CLINIC/HOSPITAL] to help patients with appointments"
}
```

## Template 3: Education
```json
{
  "userDescription": "I need a chatbot for my online course platform to help students"
}
```

## Template 4: Real Estate
```json
{
  "userDescription": "I want a chatbot to help potential buyers find properties"
}
```

## Template 5: Customer Support
```json
{
  "userDescription": "I need a general customer support chatbot for my [BUSINESS TYPE]"
}
```

---

# Postman Collection Import

If you want to import this as a Postman collection, use this JSON:

```json
{
  "info": {
    "name": "Chatbot Wizard API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Step 1 - Analyze Description",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"userDescription\": \"I want a customer support chatbot for my online bookstore\"\n}"
        },
        "url": {
          "raw": "http://localhost:3007/api/chatbot-wizard/step1",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3007",
          "path": ["api", "chatbot-wizard", "step1"]
        }
      }
    },
    {
      "name": "Step 2 - Generate Chatbot",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"sessionId\": \"PASTE_SESSION_ID_HERE\",\n  \"answers\": \"We sell fiction and non-fiction books. Friendly tone. Help with recommendations, orders, and returns.\"\n}"
        },
        "url": {
          "raw": "http://localhost:3007/api/chatbot-wizard/step2",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3007",
          "path": ["api", "chatbot-wizard", "step2"]
        }
      }
    },
    {
      "name": "Get All Chatbots",
      "request": {
        "method": "GET",
        "url": {
          "raw": "http://localhost:3007/api/chatbots",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3007",
          "path": ["api", "chatbots"]
        }
      }
    },
    {
      "name": "Get Chatbot by ID",
      "request": {
        "method": "GET",
        "url": {
          "raw": "http://localhost:3007/api/chatbots/{{chatbotId}}",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3007",
          "path": ["api", "chatbots", "{{chatbotId}}"]
        }
      }
    },
    {
      "name": "Health Check",
      "request": {
        "method": "GET",
        "url": {
          "raw": "http://localhost:3007/health",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3007",
          "path": ["health"]
        }
      }
    }
  ]
}
```

Save this JSON to a file and import it into Postman!

