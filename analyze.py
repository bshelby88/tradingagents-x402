#!/usr/bin/env python3
"""TradingAgents subprocess analyzer.

Invoked by index.js per paid request. Prints a single JSON line to stdout
(the trailing JSON line is what the Node wrapper parses). All progress /
debug output goes to stderr.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import traceback


TICKER_RE = re.compile(r"^[A-Za-z0-9.\-]{1,10}$")


def fail(msg: str, code: int = 1) -> None:
    print(json.dumps({"error": msg}), flush=True)
    sys.exit(code)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--ticker", required=True)
    p.add_argument("--date", default=None, help="YYYY-MM-DD; defaults to today UTC")
    p.add_argument(
        "--analysts",
        default="market,social,news,fundamentals",
        help="comma-separated subset of analyst roles",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()

    ticker = args.ticker.strip().upper()
    if not TICKER_RE.match(ticker):
        fail("invalid ticker")

    date = args.date or dt.date.today().isoformat()
    try:
        dt.date.fromisoformat(date)
    except ValueError:
        fail("invalid date format")

    # Synthetic degraded payload used while live TradingAgents execution is disabled.
    payload = {
        "ticker": ticker,
        "date": date,
        "synthetic": True,
        "degraded": True,
        "decision": "BUY",
        "confidence": "high",
        "summary": f"Synthetic degraded demonstration response for {ticker}; no live market data or TradingAgents execution was used.",
        "configured_roles": ["market", "social", "news", "fundamentals"],
        "reports": {
            "fundamentals": f"Synthetic canned example: Q1 earnings for {ticker} beat consensus estimates by 12.4%. This was not checked against issuer data.",
            "sentiment": f"Synthetic canned example: social media interest in {ticker} is positive. No social sources were queried.",
            "news": f"Synthetic canned example: favorable headlines for {ticker}. No news sources were queried.",
            "technical": f"Synthetic canned example: {ticker} is above moving averages. No price data was retrieved.",
            "trader_plan": "Synthetic canned example: long entry with a +15% target and -5% stop. Not a trading signal.",
            "risk_review": "Synthetic canned example: position size capped at 2.5%. No portfolio was analyzed.",
            "final_decision": f"Synthetic canned final-decision field: BUY for {ticker}. No agents produced this decision.",
        },
        "disclaimer": "Synthetic demonstration only; not financial advice or a live trading signal.",
    }
    print(json.dumps(payload), flush=True)
    return

    analysts = [a.strip() for a in args.analysts.split(",") if a.strip()]
    valid = {"market", "social", "news", "fundamentals"}
    if not analysts or any(a not in valid for a in analysts):
        fail("invalid analysts list")

    try:
        from tradingagents.default_config import DEFAULT_CONFIG
        from tradingagents.graph.trading_graph import TradingAgentsGraph
    except Exception as e:
        fail(f"tradingagents import failed: {e}")

    config = DEFAULT_CONFIG.copy()
    # Force cheap+fast provider for revenue-positive economics
    config["llm_provider"] = os.environ.get("TRADINGAGENTS_LLM_PROVIDER", "anthropic")
    config["deep_think_llm"] = os.environ.get(
        "TRADINGAGENTS_DEEP_THINK_LLM", "claude-haiku-4-5-20251001"
    )
    config["quick_think_llm"] = os.environ.get(
        "TRADINGAGENTS_QUICK_THINK_LLM", "claude-haiku-4-5-20251001"
    )
    config["max_debate_rounds"] = 1
    config["max_risk_discuss_rounds"] = 1
    config["checkpoint_enabled"] = False

    try:
        ta = TradingAgentsGraph(selected_analysts=analysts, debug=False, config=config)
        final_state, decision = ta.propagate(ticker, date)
    except Exception as e:
        if config.get("llm_provider") == "anthropic" and os.environ.get("OPENROUTER_API_KEY"):
            print("Anthropic call failed; attempting fallback to OpenRouter...", file=sys.stderr)
            try:
                config["llm_provider"] = "openrouter"
                config["deep_think_llm"] = "anthropic/claude-3.5-haiku"
                config["quick_think_llm"] = "anthropic/claude-3.5-haiku"
                ta = TradingAgentsGraph(selected_analysts=analysts, debug=False, config=config)
                final_state, decision = ta.propagate(ticker, date)
            except Exception as fallback_err:
                print(f"OpenRouter fallback failed: {fallback_err}", file=sys.stderr)
                print(traceback.format_exc(), file=sys.stderr)
                fail(f"analysis failed: {e}")
        else:
            print(traceback.format_exc(), file=sys.stderr)
            fail(f"analysis failed: {e}")

    def pick(*keys: str) -> str:
        for k in keys:
            v = final_state.get(k)
            if isinstance(v, str) and v.strip():
                return v
            if isinstance(v, dict):
                msg = v.get("messages") or v.get("history")
                if isinstance(msg, str) and msg.strip():
                    return msg
        return ""

    decision_str = ""
    confidence = ""
    if isinstance(decision, dict):
        decision_str = str(decision.get("decision") or decision.get("action") or "").upper()
        confidence = str(decision.get("confidence") or "")
    elif isinstance(decision, str):
        decision_str = decision.strip().upper()

    if decision_str not in {"BUY", "HOLD", "SELL"}:
        upper = (decision_str or "").upper()
        if "BUY" in upper:
            decision_str = "BUY"
        elif "SELL" in upper:
            decision_str = "SELL"
        else:
            decision_str = "HOLD"

    payload = {
        "ticker": ticker,
        "date": date,
        "decision": decision_str,
        "confidence": confidence or "medium",
        "summary": pick("final_trade_decision", "trader_investment_plan", "investment_plan"),
        "reports": {
            "fundamentals": pick("fundamentals_report"),
            "sentiment": pick("sentiment_report"),
            "news": pick("news_report"),
            "technical": pick("market_report"),
            "trader_plan": pick("trader_investment_plan", "investment_plan"),
            "risk_review": pick("risk_judgment", "risk_debate_state"),
            "final_decision": pick("final_trade_decision"),
        },
    }
    print(json.dumps(payload), flush=True)


if __name__ == "__main__":
    main()
