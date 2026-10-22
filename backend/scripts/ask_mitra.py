"""
Talk to the voice agent's brain from a terminal, in Telugu, Hindi or English.

    python scripts/ask_mitra.py                     # interactive; type a question, Enter
    python scripts/ask_mitra.py "పోలవరం ఖర్చు ఎంత?"   # one question and exit

Needs ANTHROPIC_API_KEY in backend/.env (each question is one or more paid Claude
calls) and the database reachable through DATABASE_URL, the same as the API.
Type "quit" to stop. The session carries over between questions, so answering
"అవును" after an offer gets the detailed version.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.voice_agent import ask  # noqa: E402


async def main(argv: list[str]) -> None:
    session_id = None
    if argv:
        reply = await ask(" ".join(argv))
        print(f"\n[{reply.language}] {reply.answer}\n\n(tools: {', '.join(reply.tools_used) or 'none'})")
        return
    print("Ask in Telugu, Hindi or English. 'quit' to stop.\n")
    while True:
        try:
            question = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not question or question.lower() in {"quit", "exit"}:
            break
        reply = await ask(question, session_id=session_id)
        session_id = reply.session_id
        print(f"\nAgent [{reply.language}]: {reply.answer}\n   (tools: {', '.join(reply.tools_used) or 'none'})\n")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
