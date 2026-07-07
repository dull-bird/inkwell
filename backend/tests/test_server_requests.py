import unittest

from inkwell.server import SignatureRequest, SplitRequest


class SplitRequestTests(unittest.TestCase):
    def test_normalizes_agent_object_page_ranges(self) -> None:
        req = SplitRequest.model_validate(
            {"path": "/tmp/example.pdf", "page_ranges": [{"start": 2, "end": 5}]}
        )
        self.assertEqual(req.normalized_ranges(), [(1, 4)])

    def test_keeps_legacy_pair_page_ranges_for_ui_requests(self) -> None:
        req = SplitRequest.model_validate(
            {"path": "/tmp/example.pdf", "page_ranges": [[1, 3]]}
        )
        self.assertEqual(req.normalized_ranges(), [(0, 2)])


class SignatureRequestTests(unittest.TestCase):
    def test_accepts_typed_signature_coordinates(self) -> None:
        req = SignatureRequest.model_validate(
            {
                "path": "/tmp/example.pdf",
                "page": 0,
                "x": 72,
                "y": 520,
                "text": "Lei Li",
                "signer": "Lei Li",
            }
        )

        self.assertEqual(req.page, 0)
        self.assertEqual(req.text, "Lei Li")
        self.assertEqual(req.signer, "Lei Li")


if __name__ == "__main__":
    unittest.main()
