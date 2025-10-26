# Database Setup Guide

## Prerequisites

1. **PostgreSQL Database** - You need a running PostgreSQL instance. You can use:
   - Local PostgreSQL installation
   - Docker
   - Cloud services (Supabase, Railway, Neon, etc.)

## Quick Setup Steps

### Step 1: Configure Environment Variables

Create a `.env` file in the project root with:

```env
# Copy your OpenAI API key
OPENAI_API_KEY=your_openai_api_key_here

# PostgreSQL connection string
DATABASE_URL="postgresql://username:password@localhost:5432/chatbot_wizard_db?schema=public"

# Server config
PORT=3007
NODE_ENV=development
```

### Step 2: Start PostgreSQL (if using Docker)

```bash
docker run --name chatbot-postgres \
  -e POSTGRES_PASSWORD=mypassword \
  -e POSTGRES_DB=chatbot_wizard_db \
  -p 5432:5432 \
  -d postgres:15
```

Then update your `.env`:
```env
DATABASE_URL="postgresql://postgres:mypassword@localhost:5432/chatbot_wizard_db?schema=public"
```

### Step 3: Generate Prisma Client & Run Migrations

```bash
# Generate Prisma Client
npx prisma generate

# Create database tables
npx prisma migrate dev --name init
```

### Step 4: Build & Run

```bash
# Build TypeScript
npm run build

# Start server
npm start
```

## Database Schema

The system uses 3 main tables:

1. **chatbots** - Stores generated chatbot configurations
2. **widget_recommendations** - Stores widget recommendation results
3. **chatbot_sessions** - Temporary sessions for wizard flow (auto-expires after 1 hour)

## Prisma Studio (Database GUI)

View and manage your database visually:

```bash
npx prisma studio
```

This opens a web interface at `http://localhost:5555`

## Common Issues

### "Module @prisma/client has no exported member PrismaClient"
**Solution:** Run `npx prisma generate` to generate the Prisma Client

### "Can't reach database server"
**Solution:** Check your DATABASE_URL and ensure PostgreSQL is running

### "Database does not exist"
**Solution:** Run `npx prisma migrate dev` to create the database and tables

## Alternative: Use Supabase (Free, No Local Setup)

1. Sign up at https://supabase.com
2. Create a new project
3. Go to Project Settings → Database
4. Copy the "Connection string" (URI format)
5. Update your `.env` with the Supabase DATABASE_URL
6. Run `npx prisma migrate dev`

Done! No need to run PostgreSQL locally.

## Verifying Setup

Test database connection:

```bash
npx prisma db push
```

If successful, you'll see: ✅ Database is now in sync

## Reset Database (if needed)

```bash
npx prisma migrate reset
```

This will:
- Drop all tables
- Run migrations
- Recreate all tables

