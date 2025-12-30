# Use Playwright's official Docker image which has browsers pre-installed
FROM mcr.microsoft.com/playwright:v1.57.0-focal

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port (Render uses PORT env variable)
EXPOSE 10000

# Start the server
CMD ["npm", "start"]
