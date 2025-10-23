# 🚀 Chatbot Wizard - Quick Copy-Paste Guide

## Step 1: Describe Your Chatbot

**POST** `http://localhost:3007/api/chatbot-wizard/step1`

```json
{
  "userDescription": "I want a customer support chatbot for my online bookstore"
}
```

📋 **Copy the `sessionId` from the response!**

---

## Step 2: Answer Questions & Generate

**POST** `http://localhost:3007/api/chatbot-wizard/step2`

```json
{
  "sessionId": "PASTE_SESSION_ID_HERE",
  "answers": "We sell fiction and non-fiction books. Friendly tone. Help with recommendations, orders, and returns."
}
```

---

## View All Chatbots

**GET** `http://localhost:3007/api/chatbots`

*(No body needed)*

---

## View Specific Chatbot

**GET** `http://localhost:3007/api/chatbots/PASTE_CHATBOT_ID_HERE`

*(No body needed)*

---

# 📝 More Example Descriptions

## Pizza Restaurant
```json
{
  "userDescription": "I need a chatbot for my pizza restaurant to take orders"
}
```

**Answers:**
```json
{
  "sessionId": "PASTE_SESSION_ID",
  "answers": "Target audience is families. Friendly casual tone. Features: menu browsing, take orders with toppings, order tracking, store hours."
}
```

---

## Gym/Fitness
```json
{
  "userDescription": "I need a chatbot for my gym to help members with class schedules"
}
```

**Answers:**
```json
{
  "sessionId": "PASTE_SESSION_ID",
  "answers": "Members are 25-45 years old. Professional motivating tone. Features: class schedules, membership upgrades, facility questions, book training sessions."
}
```

---

## Hotel Concierge
```json
{
  "userDescription": "I want a virtual concierge chatbot for my boutique hotel"
}
```

**Answers:**
```json
{
  "sessionId": "PASTE_SESSION_ID",
  "answers": "Luxury hotel with 50 rooms. Sophisticated helpful tone. Features: room service, local recommendations, transportation, facility questions."
}
```

---

## E-commerce Fashion
```json
{
  "userDescription": "I want a chatbot for my online fashion store"
}
```

**Answers:**
```json
{
  "sessionId": "PASTE_SESSION_ID",
  "answers": "We sell clothing and accessories for women 18-35. Trendy friendly tone. Features: style advice, order tracking, returns, size recommendations."
}
```

---

## Healthcare Clinic
```json
{
  "userDescription": "I need a chatbot for my medical clinic to help patients"
}
```

**Answers:**
```json
{
  "sessionId": "PASTE_SESSION_ID",
  "answers": "Family clinic serving all ages. Professional caring tone. Features: appointment booking, prescription refills, insurance questions, directions."
}
```

---

# 🎯 Pro Tips

1. **Always save the sessionId** from Step 1 - you'll need it for Step 2
2. **Be specific** in your answers - the more detail, the better the chatbot
3. **Max 3 questions** will be asked - AI keeps it simple
4. **Session expires** after Step 2 - start over if you wait too long
5. **Response time** is ~2 seconds for Step 1, ~5 seconds for Step 2

---

# ✅ Health Check

**GET** `http://localhost:3007/health`

Use this to verify server is running before testing.

