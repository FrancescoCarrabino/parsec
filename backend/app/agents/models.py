# backend/app/agents/models.py
from pydantic import BaseModel, Field
from typing import List, Dict, Callable, Any
from abc import ABC, abstractmethod


class Tool(BaseModel):
    """
    A Pydantic model representing a single tool that an agent can use.
    This structure is compatible with the OpenAI Functions/Tools API.
    """

    type: str = "function"
    function: Dict[str, Any]


class Agent(ABC):
    """
    An abstract base class that defines the "self-description" contract for all specialist agents.
    Every agent we create MUST implement these properties.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """A unique, machine-readable name for the agent. e.g., 'web_content_fetcher'."""
        pass

    @property
    @abstractmethod
    def description(self) -> Dict[str, str]:
        """A one-sentence description of the agent's expertise. For semantic search."""
        pass

    @property
    @abstractmethod
    def tools(self) -> List[Tool]:
        """A list of Pydantic Tool models that the agent can use."""
        pass

    @property
    @abstractmethod
    def available_functions(self) -> Dict[str, Callable]:
        """A mapping from tool names to the actual Python functions that implement them."""
        pass
