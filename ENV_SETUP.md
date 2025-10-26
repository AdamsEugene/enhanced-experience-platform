# Environment Configuration Template

Copy this file to `.env` and fill in your actual values.

## Required Environment Variables

### OpenAI API Key
```
OPENAI_API_KEY=your_openai_api_key_here
```

### Database Configuration
```
DATABASE_URL="postgresql://username:password@localhost:5432/chatbot_wizard_db?schema=public"
```

Replace with your actual PostgreSQL connection details:
- `username`: Your PostgreSQL username
- `password`: Your PostgreSQL password
- `localhost:5432`: Your PostgreSQL host and port
- `chatbot_wizard_db`: Your database name

### Optional: Direct URL for Prisma <5.10
```
DATABASE_URL_UNPOOLED="postgresql://username:password@localhost:5432/chatbot_wizard_db?schema=public"
```

### Server Configuration
```
PORT=3007
NODE_ENV=development
```

### CORS (optional)
```
CORS_ORIGIN=https://your-frontend-domain.com
```

## Example .env file

```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DATABASE_URL="postgresql://postgres:mypassword@localhost:5432/chatbot_wizard_db?schema=public"
PORT=3007
NODE_ENV=development
```

## Quick PostgreSQL Setup (Local)

If you don't have PostgreSQL installed:

### Using Docker:
```bash
docker run --name chatbot-postgres \
  -e POSTGRES_PASSWORD=mypassword \
  -e POSTGRES_DB=chatbot_wizard_db \
  -p 5432:5432 \
  -d postgres:15
```

Then use:
```
DATABASE_URL="postgresql://postgres:mypassword@localhost:5432/chatbot_wizard_db?schema=public"
```

### Using Supabase (Free tier):
1. Sign up at https://supabase.com
2. Create a new project
3. Go to Project Settings → Database
4. Copy the "Connection string" (URI format)
5. Use that as your DATABASE_URL

### Using Railway (Free tier):
1. Sign up at https://railway.app
2. Create a new PostgreSQL database
3. Copy the DATABASE_URL from settings
4. Use that in your .env file

