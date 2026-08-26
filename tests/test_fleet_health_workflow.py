from pathlib import Path
import unittest

WORKFLOW = Path(__file__).parents[1] / ".github" / "workflows" / "fleet-health.yml"


class FleetHealthWorkflowTests(unittest.TestCase):
    def test_challenge_probe_uses_schema_valid_payloads(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertNotIn("-d '{}'", text)
        self.assertIn(
            '"sentry-forge-x402   /api/dispute-pack       5000000 ', text
        )
        expected_payload_markers = {
            "sentry-forge-x402": '"customer_name":"Health Check"',
            "nanobanana-x402": '"prompt":"health check image"',
            "vault-pro-x402": '"goal":"Health check project scaffold"',
            "power-pack-x402": '"subject":"Health check"',
            "suprapack-x402": '"query":"health check"',
            "tradingagents-x402": '"ticker":"NVDA"',
            "nft-alpha-x402": '"collection":"pudgypenguins"',
        }
        for app, marker in expected_payload_markers.items():
            with self.subTest(app=app):
                self.assertIn(app, text)
                self.assertIn(marker, text)


if __name__ == "__main__":
    unittest.main()
