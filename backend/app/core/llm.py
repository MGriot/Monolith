import logging
import json
from typing import List, Dict, Any, Optional
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self):
        self.provider = settings.LLM_PROVIDER.lower()
        self.openai_key = settings.OPENAI_API_KEY
        self.anthropic_key = settings.ANTHROPIC_API_KEY
        self.model = settings.LLM_MODEL

    async def _call_openai(self, messages: List[Dict[str, str]], response_format: Optional[Dict] = None) -> str:
        if not self.openai_key:
            raise ValueError("OpenAI API key not configured")
        
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.openai_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.3
        }
        if response_format:
            payload["response_format"] = response_format

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            result = response.json()
            return result["choices"][0]["message"]["content"]

    async def _call_anthropic(self, messages: List[Dict[str, str]]) -> str:
        if not self.anthropic_key:
            raise ValueError("Anthropic API key not configured")
        
        # Convert OpenAI style messages to Anthropic style if needed
        # Anthropic usually expects "role" and "content" but "system" is a top-level param
        system_msg = next((m["content"] for m in messages if m["role"] == "system"), None)
        user_messages = [m for m in messages if m["role"] != "system"]
        
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.anthropic_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "claude-3-5-sonnet-20240620" if "claude" not in self.model else self.model,
            "messages": user_messages,
            "max_tokens": 4096,
            "temperature": 0.3
        }
        if system_msg:
            payload["system"] = system_msg

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            result = response.json()
            return result["content"][0]["text"]

    async def decompose_task(self, title: str, description: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Takes a task and breaks it down into subtasks.
        Returns a list of dicts with 'title' and 'description'.
        """
        system_prompt = (
            "You are a project management assistant. Your goal is to break down a high-level task into "
            "actionable, smaller subtasks (3 to 7 items). "
            "Output MUST be valid JSON: a list of objects, each with 'title' and 'description' (optional)."
        )
        user_content = f"Task: {title}\nDescription: {description or 'N/A'}"
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ]

        try:
            if self.provider == "anthropic":
                content = await self._call_anthropic(messages)
            else:
                content = await self._call_openai(messages, response_format={"type": "json_object"})
            
            # OpenAI with json_object format requires the result to be parsed
            # It usually returns a JSON with a single key or just the array if asked correctly.
            # Let's try to parse whatever comes out.
            data = json.loads(content)
            
            # Handle variations in JSON structure (e.g., if LLM wraps it in a "subtasks" key)
            if isinstance(data, dict):
                for key in ["subtasks", "tasks", "items"]:
                    if key in data and isinstance(data[key], list):
                        return data[key]
                return [data] # Fallback
            elif isinstance(data, list):
                return data
            
            return []
        except Exception as e:
            logger.error(f"LLM decomposition failed: {e}")
            return []

llm_service = LLMService()
