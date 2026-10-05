"""
The voice agent's brain.

One brain serves every way in: the Android app's wake word, the website's Mitra
button, and later a phone line and WhatsApp voice notes. Each of those turns
speech into text, sends it to `ask()`, and speaks back what it returns.

THE RULE THIS PACKAGE EXISTS TO KEEP
The platform's promise is that every figure comes from a government document and
carries that document. A voice answer is held to the same rule. The model never
answers a number from its own memory: every figure it may speak arrives through a
tool that reads this platform's own API. If no tool returns it, the answer is
"that has not been published", never a guess.
"""

from app.services.voice_agent.agent import AgentReply, ask

__all__ = ["AgentReply", "ask"]
