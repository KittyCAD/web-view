#!/usr/bin/env python3
"""Focused tests for durable wall state and tile filtering."""

import gzip
import json
import os
import tempfile
import unittest
from pathlib import Path


TEST_ROOT = Path(tempfile.mkdtemp(prefix="zoo-wall-state-test-"))
REPO_ROOT = Path(__file__).resolve().parent.parent
os.environ["WALL_LOG_DIR"] = str(TEST_ROOT / "logs")
os.environ["WALL_STATE_PATH"] = str(TEST_ROOT / "wall-state.json")

import wall_server  # noqa: E402


def sample_state():
    return {
        "version": 1,
        "controllerHeartbeatAt": 1000,
        "run": {
            "phase": "running",
            "rootStatus": "running",
            "prompt": "test",
            "sessionId": "session-test",
            "source": "openai",
            "rootInstruction": "assemble",
            "plannedAgentCount": 3,
            "rootElapsedMs": 10,
            "aggregateTime": "Aggregate Agent Time: 3m",
            "centerStatus": "working",
            "centerSnapshotUrl": "/snapshots/root.webp",
            "completionBlockers": "",
        },
        "agents": [
            {
                "id": "worker-0001",
                "assignedTileIndex": 0,
                "logs": [{"line": "a", "direction": "in"}],
            },
            {
                "id": "worker-0002",
                "assignedTileIndex": 1,
                "logs": [{"line": "b", "direction": "out"}],
            },
            {
                "id": "worker-0003",
                "assignedTileIndex": 0,
                "logs": [],
            },
        ],
        "files": {"main.kcl": "// main"},
        "interfaces": {"main.kcl": "interface"},
        "rootImports": ["part.kcl"],
        "rootLogs": [{"line": "root", "direction": "in"}],
    }


class WallStateTests(unittest.TestCase):
    def setUp(self):
        wall_server.WALL_STATE = {}
        wall_server.WALL_STATE_LOADED = False
        wall_server.WALL_STATE_PATH.unlink(missing_ok=True)
        with wall_server.SESSION_WORK_LOCK:
            wall_server.SESSION_WORK.clear()
        with wall_server.EVENT_QUEUES_LOCK:
            wall_server.EVENT_QUEUES.clear()
            wall_server.EVENT_QUEUE_WARNED.clear()
            wall_server.EVENT_STREAM_GENERATIONS.clear()
            wall_server.EVENT_STREAM_LOCKS.clear()

    def test_route_fingerprint_tracks_named_bend_end_geometry(self):
        source = (REPO_ROOT / "src" / "example.ts").read_text()
        fingerprint = source.split("const routeGeometryFingerprint", 1)[1].split(
            "const interfaceFieldValue", 1
        )[0]
        self.assertIn("|BendEnd)", fingerprint)
        self.assertIn("routeBlockDepth", fingerprint)
        self.assertIn("startsRouteBlock", fingerprint)
        self.assertIn("explicitlyRejectedVectors", source)
        self.assertIn("geometryReviewDirectiveForValidation", source)
        self.assertIn("genericGeometryContractParagraphPrefixes", source)
        self.assertIn("'PRECEDENCE CLARIFICATION:'", source)
        self.assertIn("rootHasTrackedRuntimeWork", source)
        self.assertIn("rootHasAgentDispatchWork", source)
        self.assertIn("supervisor recovered orphaned root status", source)
        self.assertIn("isRoot ? 1 : 0", source)
        self.assertIn("zooRetryAttempt,\n      )", source)

    def test_checkpoint_persists_and_reloads(self):
        result = wall_server.save_wall_state({"state": sample_state()})
        self.assertEqual(result["revision"], 1)
        self.assertTrue(wall_server.WALL_STATE_PATH.is_file())

        wall_server.WALL_STATE = {}
        wall_server.WALL_STATE_LOADED = False
        restored = wall_server.wall_state_for_client(controller=True)
        self.assertEqual(restored["run"]["sessionId"], "session-test")
        self.assertEqual(len(restored["agents"]), 3)
        self.assertEqual(restored["files"]["main.kcl"], "// main")

    def test_http_api_uses_persistent_connections(self):
        self.assertEqual(wall_server.WallHandler.protocol_version, "HTTP/1.1")

    def test_gzip_json_request_payload_is_bounded_and_decoded(self):
        body = {"state": sample_state()}
        payload = gzip.compress(json.dumps(body).encode("utf-8"))
        self.assertEqual(
            wall_server.decode_json_payload(payload, "gzip"),
            body,
        )

    def test_tile_state_is_filtered(self):
        wall_server.save_wall_state({"state": sample_state()})
        tile = wall_server.wall_state_for_client(tile=0)
        self.assertEqual(
            [agent["id"] for agent in tile["agents"]],
            ["worker-0001", "worker-0003"],
        )
        self.assertEqual(tile["files"], {})
        self.assertEqual(tile["interfaces"], {})

    def test_center_receives_graph_without_agent_logs(self):
        wall_server.save_wall_state({"state": sample_state()})
        center = wall_server.wall_state_for_client(tile=4)
        self.assertEqual(len(center["agents"]), 3)
        self.assertTrue(all(agent["logs"] == [] for agent in center["agents"]))

    def test_unchanged_revision_is_small(self):
        wall_server.save_wall_state({"state": sample_state()})
        self.assertEqual(
            wall_server.wall_state_for_client(tile=0, after=1),
            {"version": 1, "revision": 1, "unchanged": True},
        )

    def test_command_and_heartbeat(self):
        command = wall_server.enqueue_wall_command({
            "type": "start",
            "prompt": "test prompt",
        })
        queued = wall_server.wall_commands_after(0)
        self.assertEqual(queued["commands"][0]["sequence"], command["sequence"])
        self.assertEqual(queued["commands"][0]["prompt"], "test prompt")

        wall_server.record_wall_heartbeat({
            "clientId": "tile-0-test",
            "kind": "display",
            "tile": 0,
        })
        clients = wall_server.wall_health()["clients"]
        self.assertTrue(any(client["clientId"] == "tile-0-test" for client in clients))

    def test_session_work_status_tracks_active_work(self):
        wall_server.begin_session_work("session-test", "work-1")
        self.assertTrue(
            wall_server.session_work_status("session-test", "work-1")["active"]
        )
        self.assertEqual(
            wall_server.session_work_status("session-test", "work-1")["activeWork"],
            1,
        )
        self.assertEqual(
            wall_server.session_work_status("session-test", "")["workIds"],
            ["work-1"],
        )

        wall_server.finish_session_work("session-test", "work-1")
        status = wall_server.session_work_status("session-test", "work-1")
        self.assertFalse(status["active"])
        self.assertEqual(status["activeWork"], 0)
        self.assertEqual(status["workIds"], [])
        event = wall_server.event_queue_for("session-test").get_nowait()
        self.assertEqual(event["type"], "work-status")
        self.assertEqual(event["workIds"], [])

    def test_new_event_stream_lease_invalidates_previous_consumer(self):
        _, first = wall_server.begin_event_stream_lease("session-test")
        self.assertTrue(
            wall_server.event_stream_lease_is_current("session-test", first)
        )
        _, second = wall_server.begin_event_stream_lease("session-test")
        self.assertGreater(second, first)
        self.assertFalse(
            wall_server.event_stream_lease_is_current("session-test", first)
        )
        self.assertTrue(
            wall_server.event_stream_lease_is_current("session-test", second)
        )

    def test_event_poll_drains_ordered_queue(self):
        wall_server.begin_session_work("session-test", "work-1")
        wall_server.publish_event("session-test", {"type": "started", "workId": "1"})
        wall_server.publish_event("session-test", {"type": "final", "workId": "1"})
        first = wall_server.poll_session_events("session-test", 1)
        self.assertEqual([event["type"] for event in first["events"]], ["started"])
        self.assertEqual(first["remaining"], 1)
        self.assertEqual(first["workIds"], ["work-1"])
        second = wall_server.poll_session_events("session-test", 24)
        self.assertEqual([event["type"] for event in second["events"]], ["final"])
        self.assertEqual(second["remaining"], 0)

    def test_review_rework_preserves_detailed_instructions(self):
        instruction = "Coordinate the exact interface. " * 20
        parsed = wall_server.parse_rework_items({
            "rework": [{
                "target": "Zookeeper Worker 0001",
                "reason": instruction,
                "instruction": instruction,
            }],
        })
        self.assertGreater(len(parsed[0]["reason"]), 220)
        self.assertGreater(len(parsed[0]["instruction"]), 220)

    def test_agent_prompt_prioritizes_visual_review_over_generic_placement(self):
        review = "Remove redundantBuzzer from the final aggregate and leave its import unused."
        prompt = wall_server.build_zookeeper_agent_prompt(
            {
                "prompt": "test assembly",
                "rootInstruction": "assemble",
                "reviewInstruction": review,
                "interfaces": {},
            },
            {
                "name": "Zookeeper Sub-Orchestrator 0015",
                "kind": "orchestrator",
                "scope": "subassembly",
                "role": "electronics module",
                "instruction": "Place the electronics module.",
            },
            "redundantBuzzer = buzzerImport\nredundantBuzzer",
            'import "buzzer.kcl" as buzzerImport',
            "",
            1,
        )

        review_index = prompt.index("MANDATORY VISUAL REVIEW OVERRIDE")
        generic_index = prompt.index("This is an incremental assembly update")
        self.assertLess(review_index, generic_index)
        self.assertIn(review, prompt)
        self.assertIn("leave its import unused", prompt)
        self.assertIn("Never pass an imported alias typed as [any; N]", prompt)
        self.assertTrue(prompt.rstrip().endswith(
            "verify that every requested deletion, route correction, or placement correction is present in main.kcl."
        ))

    def test_agent_prompt_keeps_measured_review_beyond_short_sanitizer_limit(self):
        review = (
            "MANDATORY IMPORT-FRAME CONTRACT: "
            + ("preserve transformability and parent context " * 12)
            + "Controller tips must terminate near Z=113.486986 mm."
        )
        failure = "controller route remained flat at Z=0"
        prompt = wall_server.build_zookeeper_agent_prompt(
            {
                "prompt": "test assembly",
                "rootInstruction": "assemble",
                "reviewInstruction": review,
                "interfaces": {},
            },
            {
                "name": "Zookeeper Worker 0144",
                "kind": "worker",
                "scope": "part",
                "role": "canonical conductor",
                "instruction": "Model the conductor.",
            },
            "conductor = none()",
            "",
            failure,
            1,
        )

        self.assertGreater(len(review), 220)
        self.assertIn("Z=113.486986 mm", prompt)
        self.assertLess(
            prompt.index("MANDATORY CURRENT ACCEPTANCE FAILURE"),
            prompt.index("MANDATORY VISUAL REVIEW OVERRIDE"),
        )
        self.assertIn(failure, prompt)

    def test_transport_retry_prompt_short_circuits_repeated_discovery(self):
        prompt = wall_server.build_zookeeper_agent_prompt(
            {
                "prompt": "test assembly",
                "rootInstruction": "assemble",
                "interfaces": {},
                "transportRetryAttempt": 2,
            },
            {
                "name": "Zookeeper Orchestrator",
                "kind": "orchestrator",
                "scope": "assembly",
                "role": "root assembly",
                "instruction": "Place the direct children.",
            },
            'import "child.kcl" as child\nassembly = [child]\nassembly\n',
            'import "child.kcl" as child',
            "",
            0,
        )

        self.assertIn("MANDATORY TRANSPORT RECOVERY", prompt)
        self.assertIn("reconnect attempt 2", prompt)
        self.assertIn("run at most one mock execution", prompt)
        self.assertIn("use EditKclCode once", prompt)
        self.assertIn("only imports, settings, or comments", prompt)
        self.assertIn("transportRetryAttempt: zooRetryAttempt", (
            REPO_ROOT / "src" / "example.ts"
        ).read_text())

        result = {
            "summary": "Controller recovery completed.",
            "rawText": (
                "main.kcl was retained unchanged. The single permitted mock execution "
                "succeeded. No syntax or execution repair was necessary."
            ),
            "dialog": [],
        }
        self.assertTrue(wall_server.can_accept_validated_transport_checkpoint(
            {"transportRetryAttempt": 2},
            {"kind": "orchestrator"},
            'import "child.kcl" as child\nassembly = [child]\nassembly\n',
            "",
            result,
        ))
        self.assertFalse(wall_server.can_accept_validated_transport_checkpoint(
            {"transportRetryAttempt": 0},
            {"kind": "orchestrator"},
            'assembly = [child]\nassembly\n',
            "",
            result,
        ))
        self.assertFalse(wall_server.has_executable_kcl_body(
            'import "child.kcl" as child\n\n// placement marker only\n'
        ))
        self.assertTrue(wall_server.has_executable_kcl_body(
            'import "child.kcl" as child\nassembly = [child]\nassembly\n'
        ))

    def test_empty_placement_review_can_accept_validated_unchanged_orchestrator(self):
        instruction = """Update the assembly after a child changed.
MANDATORY EXPLICIT PLACEMENT REVIEW START

MANDATORY EXPLICIT PLACEMENT REVIEW END
If the explicit review block is empty and the current transforms remain correct, validate and return the current placement KCL unchanged.
"""
        orchestrator = {"kind": "orchestrator"}
        current_kcl = 'import "child.kcl" as child\nassembly = [child]\nassembly\n'

        self.assertTrue(wall_server.can_accept_unchanged_orchestrator_result(
            orchestrator,
            current_kcl,
            "",
            instruction,
        ))
        self.assertFalse(wall_server.can_accept_unchanged_orchestrator_result(
            {"kind": "worker"},
            current_kcl,
            "",
            instruction,
        ))
        self.assertFalse(wall_server.can_accept_unchanged_orchestrator_result(
            orchestrator,
            current_kcl,
            "renderer failure",
            instruction,
        ))

    def test_review_bom_preserves_unique_direct_child(self):
        parsed = wall_server.parse_bom_review({
            "bom": {
                "uniqueComponents": [{
                    "role": "Upper trim carrier",
                    "reason": "The lid aperture is uncovered.",
                    "instruction": "Generate one trim carrier with valve clearances.",
                    "parent": "Lid and pressure system",
                    "kind": "worker",
                }],
            },
        })
        self.assertEqual(parsed["uniqueComponents"], [{
            "role": "Upper trim carrier",
            "reason": "The lid aperture is uncovered.",
            "instruction": "Generate one trim carrier with valve clearances.",
            "parent": "Lid and pressure system",
            "kind": "worker",
        }])


if __name__ == "__main__":
    unittest.main()
