"""
Read official statistics from MoSPI's own data service.

MoSPI (the Union statistics ministry) runs an MCP server at mcp.mospi.gov.in in
front of its open data API, api.mospi.gov.in. We talk to the MCP server, not to
the API directly, for one reason found on 19 Oct 2026: api.mospi.gov.in only
completes a TLS handshake with clients that allow legacy renegotiation, which
OpenSSL 3 refuses by default. Weakening TLS for one host is a worse trade than
using the ministry's other official door, which speaks modern TLS.

The protocol is JSON-RPC over HTTP. Three calls make a session: initialize,
notifications/initialized, then tools/call. Answers may come back as plain JSON
or as a server-sent-event stream; both are handled.

WHAT THIS CLIENT REFUSES TO DO
It never turns an error into an empty result. MoSPI's server reports upstream
failures inside a successful HTTP response ("isError": true, with the API's
400 or 500 in the text). Read naively, that looks like "no data for this
quarter", and a seed built from it would quietly lose a quarter. Every such
answer raises MospiError instead.

WHY THE RETRIES
The server resets some connections mid-handshake: 2 of about 14 calls on
19 Oct 2026, each fine when repeated. A refresh that gave up on the first reset
would fail most months for no real reason. Transport errors and 5xx answers are
retried with growing waits; a 4xx or an error the server states is not, because
repeating a bad request only repeats the answer.
"""

from __future__ import annotations

import json
import time
from typing import Any, Callable

import httpx

MCP_URL = "https://mcp.mospi.gov.in/"
PROTOCOL = "2025-03-26"
HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


class MospiError(RuntimeError):
    """MoSPI answered, but not with data we can use. The message says what it said."""


def _decode(response: httpx.Response) -> Any:
    """The JSON-RPC message in a response, whether it came as JSON or as an event stream."""
    if "text/event-stream" in response.headers.get("content-type", ""):
        messages = [json.loads(line[5:].strip()) for line in response.text.splitlines()
                    if line.startswith("data:") and line[5:].strip()]
        return messages[-1] if messages else None
    return response.json() if response.text.strip() else None


class MospiClient:
    def __init__(self, url: str = MCP_URL, attempts: int = 5, timeout: float = 90.0,
                 transport: httpx.BaseTransport | None = None,
                 sleep: Callable[[float], None] = time.sleep, user_agent: str | None = None,
                 log: Callable[[str], None] | None = None):
        self.url = url
        self.attempts = attempts
        self.timeout = timeout
        self.transport = transport
        self.sleep = sleep
        self.headers = dict(HEADERS, **({"User-Agent": user_agent} if user_agent else {}))
        self.log = log      # one line per call, so a long run shows where it is
        self.calls = 0      # tool calls that returned data, for the run record
        self.retries = 0    # attempts repeated after a reset or a 5xx

    def _open(self) -> None:
        """Start a session: one connection and one initialize, reused by every call that follows."""
        self._close()
        self._http = httpx.Client(timeout=self.timeout, transport=self.transport, follow_redirects=True)
        hello = self._http.post(self.url, headers=self.headers, json={
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": PROTOCOL, "capabilities": {},
                       "clientInfo": {"name": "ap-fact-check", "version": "1"}}})
        hello.raise_for_status()
        self._session_headers = dict(self.headers)
        if hello.headers.get("mcp-session-id"):
            self._session_headers["mcp-session-id"] = hello.headers["mcp-session-id"]
        self._http.post(self.url, headers=self._session_headers, json={"jsonrpc": "2.0", "method": "notifications/initialized"})

    def _close(self) -> None:
        if getattr(self, "_http", None) is not None:
            self._http.close()
        self._http = None

    def close(self) -> None:
        self._close()

    def _session_call(self, tool: str, arguments: dict) -> dict:
        if getattr(self, "_http", None) is None:
            self._open()
        self._id = getattr(self, "_id", 1) + 1
        answer = self._http.post(self.url, headers=self._session_headers, json={
            "jsonrpc": "2.0", "id": self._id, "method": "tools/call",
            "params": {"name": tool, "arguments": arguments}})
        answer.raise_for_status()
        message = _decode(answer)
        if not isinstance(message, dict):
            raise MospiError(f"{tool}: the server sent no JSON-RPC message")
        if "error" in message:
            raise MospiError(f"{tool}: {message['error']}")
        result = message.get("result") or {}
        content = result.get("structuredContent")
        if content is None:
            texts = [c.get("text", "") for c in result.get("content", []) if c.get("type") == "text"]
            content = json.loads(texts[0]) if texts else {}
        if result.get("isError") or (isinstance(content, dict) and content.get("error")):
            stated = content.get("error") if isinstance(content, dict) else content
            raise MospiError(f"{tool} {json.dumps(arguments, sort_keys=True)}: {stated}")
        return content

    def call(self, tool: str, arguments: dict) -> dict:
        """One tool call, retried on resets and server errors, never on a stated error."""
        wait = 3.0
        for attempt in range(1, self.attempts + 1):
            try:
                content = self._session_call(tool, arguments)
                self.calls += 1
                if self.log:
                    self.log(f"{self.calls:3d} {tool} {json.dumps(arguments.get('filters', arguments), sort_keys=True)}")
                return content
            except httpx.HTTPStatusError as e:
                self._close()
                if e.response.status_code < 500 or attempt == self.attempts:
                    raise MospiError(f"{tool}: HTTP {e.response.status_code}") from e
            except httpx.TransportError as e:
                self._close()
                if attempt == self.attempts:
                    raise MospiError(f"{tool}: {type(e).__name__} after {attempt} attempts") from e
            self.retries += 1
            self.sleep(wait)
            wait *= 2
        raise MospiError(f"{tool}: no answer")  # not reached; keeps the type checker honest

    def rows(self, dataset: str, filters: dict, page_size: int = 100) -> list[dict]:
        """Every row a get_data query matches, following the pages to the end."""
        out: list[dict] = []
        page = 1
        while True:
            content = self.call("get_data", {"dataset": dataset,
                                             "filters": dict(filters, limit=str(page_size), page=str(page))})
            data = content.get("data")
            if not isinstance(data, list):
                raise MospiError(f"get_data {dataset} {filters}: no data list in the answer")
            out += data
            meta = content.get("meta_data") or {}
            if page >= int(meta.get("totalPages") or 1):
                return out
            page += 1

    def metadata(self, dataset: str, **arguments) -> dict:
        content = self.call("get_metadata", {"dataset": dataset, **arguments})
        data = content.get("filter_values", {}).get("data") if "filter_values" in content else content.get("data")
        if isinstance(data, list):
            data = data[0] if data else {}
        if not isinstance(data, dict) or not data:
            raise MospiError(f"get_metadata {dataset} {arguments}: no filter values")
        return data
