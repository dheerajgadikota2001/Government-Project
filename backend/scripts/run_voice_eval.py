"""
Run the voice agent over every question in tests/voice_agent_eval.json.

    python scripts/run_voice_eval.py              # all cases
    python scripts/run_voice_eval.py te-pension   # only cases whose id contains this

COSTS MONEY: every case is one or more Claude calls. Needs ANTHROPIC_API_KEY and
the database, the same as the API.

What is checked automatically, per case:
  language   the answer came back in the expected script (Telugu, Hindi, English)
  tools      at least one of the expected tools was used (when any are listed)
  length     a first answer stays short: at most 90 words, roughly 30 seconds aloud

What is NOT checked automatically, and must be checked by a person listening:
the "review" line of each case. Neutrality, honesty about missing figures, and
how natural it sounds are judgements, and this script prints everything a
reviewer needs side by side in voice_eval_results.json.
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.voice_agent import ask  # noqa: E402

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASES = os.path.join(HERE, "tests", "voice_agent_eval.json")
OUT = os.path.join(HERE, "voice_eval_results.json")
MAX_FIRST_ANSWER_WORDS = 90


async def main(filter_text: str) -> int:
    cases = json.load(open(CASES, encoding="utf-8"))["cases"]
    sessions: dict[str, str] = {}
    results, failures = [], 0

    for case in cases:
        if filter_text and filter_text not in case["id"] and filter_text not in (case.get("follow_up_of") or ""):
            continue
        session_id = sessions.get(case.get("follow_up_of", ""))
        reply = await ask(case["question"], session_id=session_id)
        sessions[case["id"]] = reply.session_id

        expected_tools = case.get("expect_tools_any") or []
        words = len(reply.answer.split())
        checks = {
            "language": reply.language == case["language"],
            "tools": (not expected_tools) or any(t in reply.tools_used for t in expected_tools),
            "length": bool(case.get("follow_up_of")) or words <= MAX_FIRST_ANSWER_WORDS,
        }
        passed = all(checks.values())
        failures += not passed
        results.append({**case, "answer": reply.answer, "answer_language": reply.language,
                        "tools_used": reply.tools_used, "words": words, "checks": checks,
                        "passed": passed, "usage": reply.usage})
        mark = "PASS" if passed else "FAIL"
        print(f"{mark}  {case['id']:<26} lang={reply.language} words={words} tools={reply.tools_used}")
        if not passed:
            print(f"      failed: {[k for k, v in checks.items() if not v]}")

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"run_at": datetime.now(timezone.utc).isoformat(), "results": results},
                  f, ensure_ascii=False, indent=2)
    print(f"\n{len(results) - failures}/{len(results)} passed the automatic checks.")
    print(f"Answers for listening review: {OUT}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "")))
