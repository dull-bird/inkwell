import unittest

from inkwell.server import SplitRequest


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


if __name__ == "__main__":
    unittest.main()
