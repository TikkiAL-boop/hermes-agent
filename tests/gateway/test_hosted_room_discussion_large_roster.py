"""A Discussion with more members than the default reply budget still hears every member once.

The roster limit grew past ``MAX_DISCUSSION_MESSAGES``; the first round asks every addressed member
in roster order, so with the flat budget an ``@all`` in a large room ended ``bounded/max_messages``
before the members seated last were asked, and no test drove the planner or the restart
reconstruction past a single-digit seat.
"""

from __future__ import annotations

import time
from pathlib import Path

from gateway import hosted_room_discussion as discussion
from gateway import hosted_rooms

ROOM_ID = "room-large"
GATEWAY_ID = "gateway-a"
SEATS = discussion.MAX_DISCUSSION_MESSAGES + 3
PROFILES = tuple(f"profile-{index:02d}" for index in range(SEATS))
MEMBERS = [
    {"member_id": f"member-{profile}", "profile": profile, "handle": profile, "display_name": profile.title()}
    for profile in PROFILES
]


def _events(db: Path) -> list[dict]:
    return hosted_rooms.read_events(db, room_id=ROOM_ID, since_seq=0, limit=hosted_rooms.MAX_LOG_LIMIT)["events"]


def test_every_member_of_a_large_roster_is_asked_once_and_each_task_survives_a_restart(tmp_path: Path):
    db = tmp_path / "state.db"
    room = hosted_rooms.create_room(
        db, room_id=ROOM_ID, name="Crew", members=MEMBERS, authority_gateway_id=GATEWAY_ID, now=1)
    hosted_rooms.append_event(
        db, room_id=ROOM_ID, event_id="user-1", kind="message.user", actor={"kind": "user", "id": "local-user"},
        authority_gateway_id=GATEWAY_ID, authority_epoch=1, payload={"text": "Everyone, report.", "thread_id": "t"},
        now=time.time())

    asked: list[str] = []
    while (decision := discussion.plan_next_task(room, _events(db), local_profiles=PROFILES)).status == "task":
        task = decision.task
        persisted = {"identity": task.identity, "payload": dict(task.payload)}
        rebuilt = discussion.reconstruct_task_plan(room, _events(db), persisted, local_profiles=PROFILES)
        assert (rebuilt.member, rebuilt.member_index, rebuilt.round_index) == (
            task.member, task.member_index, task.round_index)
        asked.append(task.member.profile)
        publication = discussion.plan_publication(
            room, _events(db), task, status="settled", result={"text": f"Report from {task.member.handle}."},
            local_profiles=PROFILES)
        for event in publication.events:
            hosted_rooms.append_event(db, **event.append_kwargs(ROOM_ID), now=time.time())
        assert len(asked) <= SEATS, "the Discussion must stay bounded"

    assert asked == list(PROFILES)
    assert (decision.status, decision.reason) == ("bounded", "max_messages")
