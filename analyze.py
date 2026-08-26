#!/usr/bin/env python3
"""Return the service's current synthetic TradingAgents-shaped payload."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys


TICKER_RE = re.compile(r"^[A-Za-z0-9.\-]{1,10}$")
ALLOWED_ROLES = ("market", "social", "news", "fundamentals")


def fail(msg: str, code: int = 1) -> None:
    print(json.dumps({"error": msg}), flush=True)
    sys.exit(code)


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
