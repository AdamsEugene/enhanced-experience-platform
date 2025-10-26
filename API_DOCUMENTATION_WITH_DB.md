# Complete API Documentation with Database Integration

## 🗄️ Database Setup Required

Before using the API, you must set up the database. See `DATABASE_SETUP.md` for instructions.

---

## 📋 Widget Recommendation Endpoints

### 1. Create Widget Recommendation (POST)

**Endpoint:** `POST /api/widgets/recommend`

**Body:**
```json
{
  "userIntent": "I want an insurance enrollment wizard",
  "context": "Healthcare company with 5 different plan options"
}
```

**Response:**
```json
{
  "id": "uuid-here",
  "success": true,
  "message": "Widget recommendations generated",
  "pages": [...],
  "totalPages": 5,
  "flowDescription": "..."
}
```

---

### 2. Get All Widget Recommendations (GET)

**Endpoint:** `GET /api/widgets?limit=10&offset=0`

**Query Parameters:**
- `limit` (optional): Number of records to return
- `offset` (optional): Number of records to skip

**Response:**
```json
{
  "recommendations": [
    {
      "id": "uuid",
      "userIntent": "...",
      "context": "...",
      "totalPages": 5,
      "flowDescription": "...",
      "pages": [...],
      "createdAt": "2025-10-23T...",
      "updatedAt": "2025-10-23T..."
    }
  ],
  "total": 25,
  "limit": 10,
  "offset": 0
}
```

---

### 3. Get Specific Widget Recommendation (GET)

**Endpoint:** `GET /api/widgets/:id`

**Example:** `GET /api/widgets/123e4567-e89b-12d3-a456-426614174000`

**Response:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "userIntent": "I want an insurance enrollment wizard",
  "context": "Healthcare company",
  "totalPages": 5,
  "flowDescription": "...",
  "pages": [...],
  "createdAt": "2025-10-23T...",
  "updatedAt": "2025-10-23T..."
}
```

---

### 4. Update Widget Recommendation (PUT)

**Endpoint:** `PUT /api/widgets/:id`

**Body (all fields optional):**
```json
{
  "userIntent": "Updated intent",
  "context": "Updated context",
  "totalPages": 6,
  "flowDescription": "Updated description",
  "pages": [...]
}
```

**Response:** Updated widget recommendation object

---

### 5. Delete Widget Recommendation (DELETE)

**Endpoint:** `DELETE /api/widgets/:id`

**Response:**
```json
{
  "success": true,
  "message": "Widget recommendation deleted successfully",
  "id": "123e4567-e89b-12d3-a456-426614174000"
}
```

---

### 6. Delete All Widget Recommendations (DELETE)

**Endpoint:** `DELETE /api/widgets?confirm=true`

**Note:** Requires `?confirm=true` query parameter

**Response:**
```json
{
  "success": true,
  "message": "All widget recommendations deleted successfully",
  "deletedCount": 25
}
```

---

## 🤖 Chatbot Endpoints

### 1. Create Chatbot (Wizard Step 1)

**Endpoint:** `POST /api/chatbot-wizard/step1`

**Body:**
```json
{
  "userDescription": "I want a customer support chatbot for my online bookstore"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "chatbot-session-1234567890-abc123",
  "needsMoreInfo": true,
  "questions": [
    "What types of books do you sell?",
    "What tone should the chatbot have?",
    "What are the main issues customers need help with?"
  ],
  "questionsText": "1. What types of books...\n2. What tone...\n3. What are...",
  "message": "I have a few questions to better understand your chatbot needs."
}
```

---

### 2. Generate Chatbot (Wizard Step 2)

**Endpoint:** `POST /api/chatbot-wizard/step2`

**Body:**
```json
{
  "sessionId": "chatbot-session-1234567890-abc123",
  "answers": "We sell fiction and non-fiction. Friendly tone. Help with recommendations, order tracking, and returns."
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
    "name": "BookBuddy",
    "description": "...",
    "personality": "Friendly and knowledgeable",
    "capabilities": [...],
    "conversationFlow": {...},
    "createdAt": "2025-10-23T..."
  }
}
```

---

### 3. Get All Chatbots (GET)

**Endpoint:** `GET /api/chatbots?limit=10&offset=0`

**Query Parameters:**
- `limit` (optional): Number of records to return
- `offset` (optional): Number of records to skip

**Response:**
```json
{
  "chatbots": [
    {
      "id": "chatbot-123",
      "name": "BookBuddy",
      "description": "Customer support chatbot for online bookstore",
      "personality": "Friendly and knowledgeable",
      "capabilities": [...],
      "conversationFlow": {...},
      "createdAt": "2025-10-23T...",
      "updatedAt": "2025-10-23T..."
    }
  ],
  "total": 15,
  "limit": 10,
  "offset": 0
}
```

---

### 4. Get Specific Chatbot (GET)

**Endpoint:** `GET /api/chatbots/:id`

**Example:** `GET /api/chatbots/chatbot-1234567890-def456`

**Response:**
```json
{
  "id": "chatbot-1234567890-def456",
  "name": "BookBuddy",
  "description": "Customer support chatbot for online bookstore",
  "personality": "Friendly and knowledgeable",
  "capabilities": [
    "Book recommendations",
    "Order tracking",
    "Return policy assistance"
  ],
  "conversationFlow": {
    "greeting": "Hi there! Welcome to BookBuddy...",
    "commonQuestions": [...],
    "fallbackResponse": "...",
    "escalationTriggers": [...]
  },
  "createdAt": "2025-10-23T...",
  "updatedAt": "2025-10-23T..."
}
```

---

### 5. Update Chatbot (PUT)

**Endpoint:** `PUT /api/chatbots/:id`

**Body (all fields optional):**
```json
{
  "name": "Updated Chatbot Name",
  "description": "Updated description",
  "personality": "Updated personality",
  "capabilities": ["New capability 1", "New capability 2"],
  "conversationFlow": {
    "greeting": "New greeting",
    "commonQuestions": [...],
    "fallbackResponse": "...",
    "escalationTriggers": [...]
  }
}
```

**Response:** Updated chatbot object

---

### 6. Delete Chatbot (DELETE)

**Endpoint:** `DELETE /api/chatbots/:id`

**Response:**
```json
{
  "success": true,
  "message": "Chatbot deleted successfully",
  "id": "chatbot-1234567890-def456"
}
```

---

### 7. Delete All Chatbots (DELETE)

**Endpoint:** `DELETE /api/chatbots?confirm=true`

**Note:** Requires `?confirm=true` query parameter

**Response:**
```json
{
  "success": true,
  "message": "All chatbots deleted successfully",
  "deletedCount": 15
}
```

---

## 🔄 Complete CRUD Operations Summary

### Widgets
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/widgets/recommend` | Create widget recommendation |
| GET | `/api/widgets` | Get all widget recommendations |
| GET | `/api/widgets/:id` | Get specific widget recommendation |
| PUT | `/api/widgets/:id` | Update widget recommendation |
| DELETE | `/api/widgets/:id` | Delete widget recommendation |
| DELETE | `/api/widgets?confirm=true` | Delete all widget recommendations |

### Chatbots
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chatbot-wizard/step1` | Start chatbot wizard (analyze description) |
| POST | `/api/chatbot-wizard/step2` | Complete chatbot wizard (generate chatbot) |
| GET | `/api/chatbots` | Get all chatbots |
| GET | `/api/chatbots/:id` | Get specific chatbot |
| PUT | `/api/chatbots/:id` | Update chatbot |
| DELETE | `/api/chatbots/:id` | Delete chatbot |
| DELETE | `/api/chatbots?confirm=true` | Delete all chatbots |

---

## 💡 Usage Examples

### Postman Collection

Import the complete Postman collection from `POSTMAN_GUIDE.md`

### cURL Examples

**Create Widget:**
```bash
curl -X POST http://localhost:3007/api/widgets/recommend \
  -H "Content-Type: application/json" \
  -d '{"userIntent": "Insurance enrollment wizard"}'
```

**Get All Widgets (with pagination):**
```bash
curl "http://localhost:3007/api/widgets?limit=5&offset=0"
```

**Update Widget:**
```bash
curl -X PUT http://localhost:3007/api/widgets/WIDGET_ID \
  -H "Content-Type: application/json" \
  -d '{"userIntent": "Updated intent"}'
```

**Delete Widget:**
```bash
curl -X DELETE http://localhost:3007/api/widgets/WIDGET_ID
```

**Create Chatbot (Step 1):**
```bash
curl -X POST http://localhost:3007/api/chatbot-wizard/step1 \
  -H "Content-Type: application/json" \
  -d '{"userDescription": "Pizza restaurant chatbot"}'
```

**Generate Chatbot (Step 2):**
```bash
curl -X POST http://localhost:3007/api/chatbot-wizard/step2 \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "SESSION_ID_FROM_STEP_1",
    "answers": "Families. Friendly tone. Menu, orders, tracking."
  }'
```

**Get All Chatbots:**
```bash
curl "http://localhost:3007/api/chatbots?limit=10"
```

**Update Chatbot:**
```bash
curl -X PUT http://localhost:3007/api/chatbots/CHATBOT_ID \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Bot Name"}'
```

**Delete Chatbot:**
```bash
curl -X DELETE http://localhost:3007/api/chatbots/CHATBOT_ID
```

---

## 🔐 Database Features

- **Persistent Storage:** All data is stored in PostgreSQL
- **Automatic Timestamps:** `createdAt` and `updatedAt` fields
- **Session Management:** Chatbot sessions auto-expire after 1 hour
- **Data Validation:** Prisma schema ensures data integrity
- **Pagination Support:** Use `limit` and `offset` for large datasets

---

## 📊 Database Tables

1. **chatbots**
   - id (UUID, Primary Key)
   - name, description, personality
   - capabilities (Array)
   - conversationFlow (JSON)
   - createdAt, updatedAt

2. **widget_recommendations**
   - id (UUID, Primary Key)
   - userIntent, context
   - totalPages, flowDescription
   - pages (JSON)
   - createdAt, updatedAt

3. **chatbot_sessions**
   - id (UUID, Primary Key)
   - userDescription
   - questions (Array)
   - createdAt, expiresAt

---

## 🚀 Quick Start with Database

1. **Setup Database** (see DATABASE_SETUP.md)
2. **Generate Prisma Client:** `npx prisma generate`
3. **Run Migrations:** `npx prisma migrate dev --name init`
4. **Start Server:** `npm start`
5. **Test API:** Use Postman or cURL examples above

---

## 🛠️ Prisma Studio

View and manage your database visually:

```bash
npx prisma studio
```

Opens at `http://localhost:5555`

