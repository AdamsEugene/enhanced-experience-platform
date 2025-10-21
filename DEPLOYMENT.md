# Deployment Guide

## Deploying to Render

This project is configured to deploy automatically to Render.

### Prerequisites

1. A Render account
2. An OpenAI API key

### Deployment Steps

1. **Connect your GitHub repository to Render**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

2. **Configure Environment Variables**
   - In Render dashboard, go to your service
   - Go to "Environment" tab
   - Add the following environment variables:
     - `OPENAI_API_KEY`: Your OpenAI API key
     - `NODE_ENV`: `production`
     - `PORT`: `10000` (or leave default)

3. **Deploy Settings**
   - **Build Command**: `pnpm install --frozen-lockfile`
   - **Start Command**: `node dist/server.js`
   - **Node Version**: Set via `.node-version` file (22.16.0)

The `render.yaml` file in the root directory contains these settings. The `.node-version` file specifies the Node.js version.

### How It Works

1. Render runs `pnpm install --frozen-lockfile`
2. The `postinstall` script automatically runs `tsc` to compile TypeScript
3. Compiled JavaScript files are output to the `dist/` directory
4. Render starts the server with `node dist/server.js`

### Troubleshooting

**Error: Cannot find module 'dist/server.js'**
- Ensure TypeScript is in `dependencies` (not just `devDependencies`)
- Check that the `postinstall` script runs successfully
- Verify that `tsconfig.json` outputs to `dist/` directory

**Build fails during TypeScript compilation**
- Check for TypeScript errors locally: `pnpm build`
- Fix any type errors before pushing

**Environment variables not working**
- Double-check all required env vars are set in Render dashboard
- Ensure `OPENAI_API_KEY` is correctly configured
- Check that `.env` file is NOT committed to git (it's in `.gitignore`)

### Local Testing

Test the build process locally before deploying:

```bash
# Clean build
rm -rf dist

# Install dependencies
pnpm install --frozen-lockfile

# The postinstall should run automatically and create dist/
# If not, run manually:
pnpm build

# Start production server
pnpm start
```

### Continuous Deployment

Once configured, Render will automatically deploy when you:
- Push to the `main` branch
- Merge a pull request to `main`

You can also trigger manual deploys from the Render dashboard.

### Health Check

After deployment, verify the service is running:
- Visit: `https://your-app.onrender.com/health`
- You should see a JSON response with status "ok"

### API Endpoints

The following endpoints will be available after deployment:
- `GET /health` - Health check
- `POST /api/forms/generate` - Generate a new form
- `POST /api/widgets/recommend` - Get widget recommendations
- `GET /api/forms` - List all forms
- And more (see main README for complete API documentation)

