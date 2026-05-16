FROM node:22-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv git build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Vendor TradingAgents source (build context copies it in from sibling ../TradingAgents via tar)
COPY engine/ /app/TradingAgents/
RUN pip3 install --break-system-packages -e /app/TradingAgents

# Node deps
COPY package*.json ./
RUN npm install --omit=dev

# Service code
COPY index.js analyze.py ./
RUN chmod +x analyze.py

ENV TRADINGAGENTS_DIR=/app/TradingAgents
ENV PYTHON_BIN=python3
ENV PORT=3000
ENV TRADINGAGENTS_LLM_PROVIDER=anthropic
ENV TRADINGAGENTS_DEEP_THINK_LLM=claude-haiku-4-5-20251001
ENV TRADINGAGENTS_QUICK_THINK_LLM=claude-haiku-4-5-20251001
ENV PYTHONUNBUFFERED=1

EXPOSE 3000
CMD ["node", "index.js"]
