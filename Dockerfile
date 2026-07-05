FROM node:20-slim
WORKDIR /app
RUN npm install -g @mima-ai/governance-mcp@latest
ENTRYPOINT ["mima-governance-mcp"]
