import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location("transport", Path(__file__).with_name("transport.py"))
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)

class PublicationGateTests(unittest.TestCase):
    def test_pending_then_verified_success(self):
        with patch.object(transport, "api", side_effect=[{"state": "PENDING"}, {"state": "PASSED"}]) as api, patch.object(transport.time, "sleep"):
            transport.wait_for_publication("123", "2")
            self.assertEqual(api.call_count, 2)
            self.assertIn("attempt=2", api.call_args.args[0])

    def test_failure_and_unrecognized_receipt_fail(self):
        for state in ["FAILED", "COMPLETE", None]:
            with patch.object(transport, "api", return_value={"state": state}):
                with self.assertRaises(ValueError):
                    transport.wait_for_publication("123", "1")

    def test_timeout_and_api_failure_fail(self):
        with patch.object(transport.time, "monotonic", side_effect=[0, 601]):
            with self.assertRaises(TimeoutError):
                transport.wait_for_publication("123", "1")
        with patch.object(transport, "api", side_effect=OSError("offline")):
            with self.assertRaises(OSError):
                transport.wait_for_publication("123", "1")
