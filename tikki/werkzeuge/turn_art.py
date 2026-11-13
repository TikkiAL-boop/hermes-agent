"""Tikki – wer den laufenden Turn treibt: ein Mensch, ein Raum oder ein Auftrag ohne Menschen.

Das Plugin ``gedaechtnis`` hängt daran: nur was ein Mensch gesagt hat, steht als „Mensch:“ im
Gedächtnis. (Ob Post rausgeht, hängt nicht daran, sondern an Hermes' Freigabe – ``pa/post.py``.)

Gelesen werden Hermes' eigene Kennzeichen des Turns (ContextVars, je Turn gebunden – nie die
Prozessumgebung eines anderen Profils): Cron-Sitzung, delegiertes Kind, Kanban-Arbeiter, Sitzung
eines gehosteten Raums (``source=bot_room``), unbeaufsichtigte Plattformen. Lässt sich der Turn
nicht bestimmen, gilt er als Auftrag: die vorsichtige Seite.
"""

from __future__ import annotations

import re

MENSCH, RAUM, AUFTRAG = "mensch", "raum", "auftrag"

#: Sitzungsquelle der Raum-Runden (``tui_gateway/hosted_room_driver.py::ROOM_SESSION_SOURCE``).
RAUM_QUELLE = "bot_room"
#: Plattformen ohne Menschen am anderen Ende (wie ``tools/approval_context.py``), dazu Cron.
OHNE_MENSCH = frozenset({"api_server", "webhook", "msgraph_webhook", "cron"})
#: So beginnt der Prompt einer Raum-Runde (``gateway/hosted_room_discussion.py::_build_prompt``).
RAUM_PROMPT = re.compile(r'^\[Discussion: "(?P<raum>.*?)"\] You are @(?P<mitglied>[^\s,]+)')


def raum_aus_prompt(text: object) -> tuple[str, str] | None:
    """(Raumname, @-Name des Mitglieds), wenn *text* der Prompt einer Raum-Runde ist."""
    treffer = RAUM_PROMPT.match(text) if isinstance(text, str) else None
    return (treffer.group("raum"), treffer.group("mitglied")) if treffer else None


def turn_art(*, plattform: str | None = None, prompt: object = None) -> str:
    """``mensch``, ``raum`` oder ``auftrag`` für den Turn, in dem der Aufrufer gerade läuft.

    ``plattform`` und ``prompt`` sind, was der Aufrufer schon weiß (Hook-Nutzlast ``platform``,
    ``user_message`` bzw. ``user_task`` eines Werkzeugs); sie ergänzen die Kennzeichen des Turns.
    """
    try:
        from agent.delegation_context import is_delegated_child_process_context, owned_kanban_task
        from gateway.session_context import get_session_env
        from utils import is_truthy_value

        if (
            is_truthy_value(get_session_env("HERMES_CRON_SESSION", ""))
            or is_delegated_child_process_context()
            or owned_kanban_task()
        ):
            return AUFTRAG
        quelle = get_session_env("HERMES_SESSION_SOURCE", "").strip().lower()
        if quelle == RAUM_QUELLE or raum_aus_prompt(prompt):
            return RAUM
        plattformen = {str(plattform or "").strip().lower(), get_session_env("HERMES_SESSION_PLATFORM", "").strip().lower()}
        return AUFTRAG if plattformen & OHNE_MENSCH else MENSCH
    except Exception:
        return AUFTRAG
