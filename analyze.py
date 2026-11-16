#!/usr/bin/env python3
"""Analyzer for the paid tradingagents-x402 route.

Two modes, chosen by environment (never by request):

- REAL mode — when TRADINGAGENTS_FORCE_REAL_ANALYSIS=1 AND ANTHROPIC_API_KEY
  are both present, run the vendored TradingAgents engine for real:
  live market data via yfinance + live multi-agent LLM execution. Any
  provider/analysis error exits non-zero (Node answers 503 honestly and the
  payment is NOT settled). Synthetic output is never sold silently.
- SYNTHETIC mode — otherwise, emit the canned degraded demonstration payload
  (free surfaces only; the paid route 503s when real mode is not enabled).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys


TICKER_RE = re.compile(r"^[A-Za-z0-9.\-]{1,10}$")
ALLOWED_ROLES = ("market", "social", "news", "fundamentals")

# Engine state report field -> published report key (same keys as the
# synthetic payload so consumers see one consistent shape).
ROLE_STATE_FIELDS = {
    "market": "market_report",
    "social": "sentiment_report",
    "news": "news_report",
    "fundamentals": "fundamentals_report",
}

DECISION_RE = re.compile(r"\b(BUY|SELL|HOLD)\b", re.IGNORECASE)


def fail(msg: str, code: int = 1) -> None:
    print(json.dumps({"error": msg}), flush=True)
    sys.exit(code)


def real_mode_requested() -> bool:
    return os.environ.get("TRADINGAGENTS_FORCE_REAL_ANALYSIS") == "1"


def resolve_trade_date(date: str | None) -> str:
    """Default to the most recent weekday (engines need market data)."""
    if date:
        return date
    d = dt.date.today()
    while d.weekday() >= 5:  # Sat/Sun -> back to Friday
        d -= dt.timedelta(days=1)
    return d.isoformat()


def run_real_analysis(ticker: str, date: str, roles: list[str]) -> dict:
    """Run the vendored TradingAgents engine for real; raise on any failure.

    Cost bounding (guardrails): haiku-class models come from env (set in the
    Dockerfile), researcher/risk debate rounds default to 0 unless overridden
    by env, and the Node layer enforces ANALYSIS_TIMEOUT_MS.
    """
    from tradingagents.default_config import DEFAULT_CONFIG
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise RuntimeError("real mode enabled but ANTHROPIC_API_KEY is not set")

    config = dict(DEFAULT_CONFIG)
    config["llm_provider"] = os.environ.get("TRADINGAGENTS_LLM_PROVIDER", "anthropic")
    config["deep_think_llm"] = os.environ.get(
        "TRADINGAGENTS_DEEP_THINK_LLM", config.get("deep_think_llm", "")
    )
    config["quick_think_llm"] = os.environ.get(
        "TRADINGAGENTS_QUICK_THINK_LLM", config.get("quick_think_llm", "")
    )
    config["max_debate_rounds"] = int(
        os.environ.get("TRADINGAGENTS_MAX_DEBATE_ROUNDS", "0")
    )
    config["max_risk_discuss_rounds"] = int(
        os.environ.get("TRADINGAGENTS_MAX_RISK_ROUNDS", "0")
    )
    config["max_recur_limit"] = int(os.environ.get("TRADINGAGENTS_MAX_RECUR", "30"))
    config["checkpoint_enabled"] = False
    config["data_cache_dir"] = "/tmp/ta-cache"
    config["results_dir"] = "/tmp/ta-results"

    graph = TradingAgentsGraph(selected_analysts=roles, config=config)
    state = graph.propagate(ticker, date)
    if not state or not isinstance(state, dict):
        raise RuntimeError("engine returned no state")

    reports: dict[str, str] = {}
    for role in roles:
        value = state.get(ROLE_STATE_FIELDS[role]) or ""
        text = str(value).strip()
        if not text:
            raise RuntimeError(f"engine returned empty {role} report")
        reports[role] = text

    trader_plan = str(state.get("trader_investment_plan") or "").strip()
    if not trader_plan:
        raise RuntimeError("engine returned empty trader plan")
    final_decision = str(state.get("final_trade_decision") or "").strip()
    if not final_decision:
        raise RuntimeError("engine returned empty final decision")

    decisions = DECISION_RE.findall(final_decision)
    decision = decisions[-1].upper() if decisions else "HOLD"
    conf_match = re.search(r"confidence[^A-Za-z0-9]*([A-Za-z]+)", final_decision, re.I)
    confidence = conf_match.group(1).lower() if conf_match else "unspecified"

    return {
        "ticker": ticker,
        "date": date,
        "synthetic": False,
        "degraded": False,
        "decision": decision,
        "confidence": confidence,
        "summary": final_decision[:800],
        "configured_roles": roles,
        "reports": {
            **reports,
            "trader_plan": trader_plan,
            "risk_review": (str(state.get("investment_plan") or "")[:2000] or trader_plan),
            "final_decision": final_decision,
        },
        "disclaimer": "Real multi-agent TradingAgents run on live market data; analysis output, not financial advice or a trading signal.",
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ticker", required=True)
    parser.add_argument("--date", default=None, help="YYYY-MM-DD; defaults to today UTC")
    parser.add_argument(
        "--analysts",
        default=",".join(ALLOWED_ROLES),
        help="comma-separated subset of analyst roles",
    )
    return parser.parse_args()


def selected_roles(value: str) -> list[str]:
    raw_roles = value.split(",")
    if any(not role.strip() for role in raw_roles):
        fail("invalid analysts list")

    roles = [role.strip() for role in raw_roles]
    if (
        len(set(roles)) != len(roles)
        or any(role not in ALLOWED_ROLES for role in roles)
    ):
        fail("invalid analysts list")
    return roles


def main() -> None:
    args = parse_args()

    ticker = args.ticker.strip().upper()
    if not TICKER_RE.fullmatch(ticker):
        fail("invalid ticker")

    date = args.date or dt.date.today().isoformat()
    try:
        dt.date.fromisoformat(date)
    except ValueError:
        fail("invalid date format")

    roles = selected_roles(args.analysts)

    if real_mode_requested():
        try:
            payload = run_real_analysis(ticker, date, roles)
        except Exception as exc:  # noqa: BLE001 — any failure must be honest 503
            fail(f"real analysis unavailable: {type(exc).__name__}")
        print(json.dumps(payload), flush=True)
        return

    role_reports = {
        "market": (
            "technical",
            f"Synthetic canned example: {ticker} is above moving averages. No price data was retrieved.",
        ),
        "social": (
            "sentiment",
            f"Synthetic canned example: social media interest in {ticker} is positive. No social sources were queried.",
        ),
        "news": (
            "news",
            f"Synthetic canned example: favorable headlines for {ticker}. No news sources were queried.",
        ),
        "fundamentals": (
            "fundamentals",
            f"Synthetic canned example: Q1 earnings for {ticker} beat consensus estimates by 12.4%. This was not checked against issuer data.",
        ),
    }
    reports = {role_reports[role][0]: role_reports[role][1] for role in roles}
    reports.update(
        {
            "trader_plan": "Synthetic canned example: long entry with a +15% target and -5% stop. Not a trading signal.",
            "risk_review": "Synthetic canned example: position size capped at 2.5%. No portfolio was analyzed.",
            "final_decision": f"Synthetic canned final-decision field: BUY for {ticker}. No agents produced this decision.",
        }
    )

    payload = {
        "ticker": ticker,
        "date": date,
        "synthetic": True,
        "degraded": True,
        "decision": "BUY",
        "confidence": "high",
        "summary": f"Synthetic degraded demonstration response for {ticker}; no live market data or TradingAgents execution was used.",
        "configured_roles": roles,
        "reports": reports,
        "disclaimer": "Synthetic demonstration only; not financial advice or a live trading signal.",
    }
    print(json.dumps(payload), flush=True)


if __name__ == "__main__":
    main()
