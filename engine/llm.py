"""
llm.py — provider-agnostic LLM wrapper via LiteLLM.

One function: call(model, system, messages, **kwargs) -> str

LiteLLM translates a single call() interface to any provider. Swap providers
by changing model strings in MODELS — no other code changes needed.

Provider cheat sheet:
  Anthropic  →  "claude-haiku-4-5", "claude-sonnet-4-6", etc.
               Needs: ANTHROPIC_API_KEY
  Gemini     →  "gemini/gemini-1.5-pro", "gemini/gemini-2.0-flash", etc.
               Needs: GEMINI_API_KEY
  OpenAI     →  "gpt-4o", "gpt-4o-mini", etc.
               Needs: OPENAI_API_KEY
  OpenAI-compatible (Magica AI, etc.)
             →  "openai/your-model-name"
               Needs: OPENAI_API_KEY=<provider key>
                      OPENAI_API_BASE=<provider base url>

Install: pip install litellm
"""

import os

from dotenv import load_dotenv
import litellm

load_dotenv()  # loads .env from project root; no-op if file absent

# Suppress LiteLLM's verbose logging — it chatters by default
litellm.suppress_debug_info = True

# Role → model assignments.
# Override any role via .env: MODEL_PERSONALITY, MODEL_DIRECTOR, MODEL_JUDGE.
# Personalities fire once per turn for every speaker, so cost compounds fast — use cheap.
# Director generates one twist per course — cheap is fine.
# Judge scores everyone at reckoning — keep consistent across runs for eval validity.
MODELS = {
    # Haiku: no hidden reasoning chain, predictable output length, good voice quality.
    # DeepSeek flash is cheaper but burns max_tokens on internal reasoning — empty output
    # unless max_tokens is raised to 800+. Override via MODEL_PERSONALITY in .env.
    "personality": os.getenv("MODEL_PERSONALITY", "openai/~anthropic/claude-haiku-latest"),
    "director":    os.getenv("MODEL_DIRECTOR",    "openai/~anthropic/claude-haiku-latest"),
    "judge":       os.getenv("MODEL_JUDGE",        "openai/~anthropic/claude-haiku-latest"),
}


# ─── Token accumulator ────────────────────────────────────────────────────────
# Counts tokens across all LLM calls. Reset at the start of each run_episode().

_token_totals: dict[str, int] = {"prompt": 0, "completion": 0}


def reset_token_totals() -> None:
    _token_totals["prompt"] = 0
    _token_totals["completion"] = 0


def get_token_totals() -> dict[str, int]:
    return dict(_token_totals)


def override_models(overrides: dict[str, str]) -> None:
    """Update MODELS in place. Called from run.py when CLI model args are passed.

    Only overrides roles present in overrides; leaves others unchanged.
    """
    for role, model in overrides.items():
        if role in MODELS and model:
            MODELS[role] = model


def call(model: str, system: str, messages: list[dict], **kwargs) -> str:
    """Send a request to any LLM provider via LiteLLM. Returns response text.

    Args:
        model:    Model string. Use MODELS["role"] for role-based selection,
                  or pass any LiteLLM-supported model string directly.
        system:   System prompt — persona card text, director instructions, etc.
                  Prepended as {"role": "system"} before the message history.
        messages: Conversation history as [{"role": "user"|"assistant", "content": str}, ...]
        **kwargs: Forwarded to litellm.completion. Useful overrides:
                    max_tokens (int, default 1024) — raise for long confessionals
                    temperature (float) — supported on most providers
                    api_base (str) — override base URL per-call

    Returns:
        Response text as a plain string.

    Raises:
        litellm.exceptions.* on API failures (rate limit, auth, etc.)
    """
    max_tokens = kwargs.pop("max_tokens", 1024)

    # LiteLLM uses OpenAI-style messages throughout; it handles per-provider
    # translation (e.g. Anthropic's separate system param) internally.
    full_messages = [{"role": "system", "content": system}] + messages

    response = litellm.completion(
        model=model,
        messages=full_messages,
        max_tokens=max_tokens,
        **kwargs,
    )

    content = response.choices[0].message.content
    # Some LLMs return null content (e.g. on refusal or empty completion).
    if not content:
        finish = response.choices[0].finish_reason
        print(f"  [WARN] {model} returned empty content (finish_reason={finish!r})")

    # Accumulate token usage when the provider returns it.
    if hasattr(response, "usage") and response.usage:
        _token_totals["prompt"] += response.usage.prompt_tokens or 0
        _token_totals["completion"] += response.usage.completion_tokens or 0

    return content or ""
