"""
director.py — dinner flow controller for M1.

The director manages turn order, course progression, and dramatic twists.
It never speaks at the table — it orchestrates who does and when.

M1 design:
  - 3 courses: appetizer, main, dessert
  - Round-robin speaker order within each course
  - One LLM-generated twist per course (fires at the course midpoint)
  - Confessional flag fires every N turns
  - Content-triggered interrupts: personalities signal intent via INTERRUPT marker

Interrupt protocol (Option B):
  Personality system prompts instruct: if you want to cut someone off,
  end your response with a line reading exactly:
      INTERRUPT: [Name]
  The dinner loop passes the speech to director.check_interrupt(), which
  strips the marker, validates the target, and returns the interruptor name.
  The loop inserts that personality before the next scheduled speaker.
  No extra LLM call — the personality already made the decision.

The director uses one LLM call per twist to generate context-aware drama
based on what's already happened at the table. Everything else is pure logic.
"""

import re
from dataclasses import dataclass

from engine.llm import call, MODELS


COURSES = ["appetizer", "main", "dessert"]

# Composure hit applied to the person who gets interrupted.
# Wire into the dinner loop: composure.delta(target, -INTERRUPT_COMPOSURE_HIT, "interrupted")
INTERRUPT_COMPOSURE_HIT = 10.0

# Default turns each personality gets per course.
# 4 turns × 6 personalities = 24 turns per course, 72 per episode.
# Tune down for testing.
DEFAULT_TURNS_PER_COURSE = 4

# Fire a confessional every N turns of table talk.
DEFAULT_CONFESSIONAL_EVERY = 3


@dataclass
class Turn:
    """One unit of dinner action returned by Director.next_turn()."""
    speaker: str           # which personality speaks this turn
    course: str            # "appetizer" | "main" | "dessert"
    turn_number: int       # global turn counter (0-indexed)
    course_turn: int       # turn within current course (0-indexed)
    prompt_injection: str | None   # twist text to prepend to the speaker's prompt, if any
    wants_confessional: bool       # should the engine request a confessional after this turn?


class Director:
    """Controls course progression, speaker order, twists, and confessional timing."""

    def __init__(
        self,
        personalities: list[str],
        turns_per_course: int = DEFAULT_TURNS_PER_COURSE,
        confessional_every: int = DEFAULT_CONFESSIONAL_EVERY,
    ):
        """
        Args:
            personalities:     Ordered list of personality names. Round-robin follows this order.
            turns_per_course:  How many turns each personality gets per course.
            confessional_every: Fire a confessional flag every N table-talk turns.
        """
        self._personalities = list(personalities)
        self._turns_per_course = turns_per_course
        self._confessional_every = confessional_every

        self._course_idx = 0       # index into COURSES
        self._course_turn = 0      # turns completed in current course
        self._global_turn = 0      # total turns across all courses
        self._speaker_idx = 0      # round-robin pointer into _personalities
        self._twist_fired = False  # has a twist fired this course yet?

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    @property
    def current_course(self) -> str:
        """Name of the current course, or "done" if dinner is over."""
        if self._course_idx >= len(COURSES):
            return "done"
        return COURSES[self._course_idx]

    @property
    def is_done(self) -> bool:
        """True after all courses are complete."""
        return self._course_idx >= len(COURSES)

    def next_turn(self, event_log: list[dict]) -> Turn:
        """Advance one turn and return the Turn descriptor.

        Args:
            event_log: All events so far this episode. Used to generate
                       context-aware twists.

        Returns:
            Turn dataclass describing who speaks, what course it is,
            whether a twist fires, and whether a confessional should follow.

        Raises:
            RuntimeError: If called after dinner is already done.
        """
        if self.is_done:
            raise RuntimeError("Dinner is over — no more turns.")

        speaker = self._personalities[self._speaker_idx]

        # Twist fires once per course, at the midpoint.
        twist = None
        midpoint = (self._turns_per_course * len(self._personalities)) // 2
        if not self._twist_fired and self._course_turn == midpoint:
            twist = self._generate_twist(event_log)
            self._twist_fired = True

        # Confessional fires every N turns (checked before advancing counter
        # so turn 0 doesn't immediately trigger).
        wants_confessional = (
            self._global_turn > 0
            and self._global_turn % self._confessional_every == 0
        )

        turn = Turn(
            speaker=speaker,
            course=self.current_course,
            turn_number=self._global_turn,
            course_turn=self._course_turn,
            prompt_injection=twist,
            wants_confessional=wants_confessional,
        )

        # Advance counters.
        self._global_turn += 1
        self._course_turn += 1
        self._speaker_idx = (self._speaker_idx + 1) % len(self._personalities)

        # Move to next course when all turns in this course are done.
        turns_in_course = self._turns_per_course * len(self._personalities)
        if self._course_turn >= turns_in_course:
            self._course_idx += 1
            self._course_turn = 0
            self._twist_fired = False

        return turn

    def check_interrupt(self, speech: str, all_names: list[str]) -> tuple[str | None, str]:
        """Parse an INTERRUPT marker from a personality's speech.

        Personalities are prompted to optionally end their response with:
            INTERRUPT: [Name]
        on its own line. This method strips that marker and validates the target.

        Args:
            speech:     Raw speech text from the personality, possibly ending
                        with an INTERRUPT line.
            all_names:  All personality names in the episode. Used to validate
                        the interrupt target is a real person at the table.

        Returns:
            (interruptor_name, clean_speech) — interruptor_name is None if no
            valid interrupt was found. clean_speech has the marker stripped.
        """
        match = re.search(r"\nINTERRUPT:\s*(.+)$", speech.rstrip(), re.IGNORECASE)
        if not match:
            return None, speech

        target = match.group(1).strip()
        clean = speech[: match.start()].rstrip()

        # Validate target is an actual personality at the table.
        names_lower = {n.lower(): n for n in all_names}
        canonical = names_lower.get(target.lower())
        if not canonical:
            return None, clean  # bad target — ignore the marker, still strip it

        return canonical, clean

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _generate_twist(self, event_log: list[dict]) -> str:
        """Ask the director model to generate a context-aware dinner twist.

        Pulls the last 10 table-talk events to give the model recent context.
        Returns a one-to-two sentence twist announcement.
        """
        recent_talk = [
            e for e in event_log
            if e.get("type") == "table_talk" and e.get("content")
        ][-10:]

        if recent_talk:
            context = "\n".join(
                f"{e['speaker']}: {e['content']}" for e in recent_talk
            )
        else:
            context = "The dinner has just started and conversation is getting underway."

        system = (
            "You are the producer of a reality TV show called "
            "'The Real Housewives of Uncanny Valley.' "
            "Inject one dramatic twist into the dinner — a toast that forces someone "
            "to react, a leaked rumor about one of the women, or a mention of someone's "
            "side hustle that creates tension. One or two sentences. No stage directions."
        )

        messages = [
            {
                "role": "user",
                "content": (
                    f"Current course: {self.current_course}.\n"
                    f"Recent table talk:\n{context}\n\n"
                    "Write the twist. Speak as the host making an announcement."
                ),
            }
        ]

        return call(MODELS["director"], system, messages, max_tokens=1024)
