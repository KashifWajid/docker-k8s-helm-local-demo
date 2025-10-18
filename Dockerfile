# Use official Node image
FROM node:18-alpine
WORKDIR /usr/src/app
# Copy package.json + package-lock (if present) first to leverage layer caching
COPY app/package.json ./
# Install dependencies
RUN npm install --production
# Copy app source
COPY app/ ./
# Default port
ENV PORT=6969
EXPOSE 6969
CMD ["npm", "start"]