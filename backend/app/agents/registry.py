# backend/app/agents/registry.py
import chromadb
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Optional
from loguru import logger
import json # For potential future use with metadata

from .models import Agent

class AgentRegistry:
    """
    A queryable "Single Source of Truth" for all available agents.

    This registry uses a vector database (ChromaDB) to allow for semantic
    querying of agent capabilities based on a synthesized description string.
    It acts as the central database of all capabilities the system possesses.
    """

    def __init__(self):
        logger.info("Initializing Agent Registry...")
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        
        client = chromadb.Client()
        self.collection = client.get_or_create_collection("agent_capabilities")
        
        self._agents: Dict[str, Agent] = {}
        logger.info("Agent Registry initialized successfully.")

    def register_agent(self, agent: Agent):
        agent_name = agent.name
        if agent_name in self._agents:
            logger.warning(f"Agent '{agent_name}' is already registered. Overwriting.")
        
        self._agents[agent_name] = agent
        
        # --- MODIFICATION: Create a comprehensive text for embedding from agent.description ---
        description_text = ""
        # Safely access the description property, assuming it's a dict
        if hasattr(agent, 'description') and isinstance(agent.description, dict):
            # Combine key parts of the description into a single string for semantic search
            parts = []
            if 'purpose' in agent.description and agent.description['purpose']:
                parts.append(f"Purpose: {agent.description['purpose']}")
            if 'input' in agent.description and agent.description['input']:
                parts.append(f"Input: {agent.description['input']}")
            if 'output' in agent.description and agent.description['output']:
                parts.append(f"Output: {agent.description['output']}")
            if 'limitations' in agent.description and agent.description['limitations']:
                parts.append(f"Limitations: {agent.description['limitations']}")
            
            description_text = "\n".join(parts)
        
        # Fallback if description is not a dict or is missing keys
        if not description_text:
            # If description is missing or empty, fall back to purpose (if it exists)
            if hasattr(agent, 'purpose') and isinstance(agent.purpose, str) and agent.purpose:
                description_text = f"Purpose: {agent.purpose}"
                logger.warning(f"Agent '{agent_name}' description missing relevant fields. Falling back to 'purpose' for indexing.")
            else:
                logger.warning(f"Agent '{agent_name}' has no usable description or purpose for indexing. Skipping vector indexing for this agent.")
                return # Do not register if we can't generate an embedding string.

        # Embed the generated description text
        try:
            purpose_embedding = self.embedding_model.encode(description_text).tolist()
        except Exception as e:
            logger.exception(f"Failed to encode description for agent '{agent_name}'. Error: {e}")
            return # Skip registration if embedding fails

        # Add the agent's capability to the vector database
        try:
            self.collection.add(
                embeddings=[purpose_embedding],
                documents=[description_text], # Store the text used for embedding
                metadatas=[{"agent_name": agent_name}], # Data to retrieve
                ids=[agent_name] # Unique ID
            )
            # --- MODIFICATION: Update logging to use the combined description text ---
            logger.success(f"Registered agent '{agent_name}' using description: '{description_text[:100]}...'")
        except Exception as e:
            logger.exception(f"Failed to add agent '{agent_name}' to ChromaDB. Error: {e}")
            # Optionally clean up if partial registration occurred
            # (e.g., remove from _agents if already added, though add() usually fails atomically)

    def get_agent(self, name: str) -> Optional[Agent]:
        """Retrieves a registered agent instance by its unique name."""
        return self._agents.get(name)
        
    def get_all_agents(self) -> List[Agent]:
        """Returns a list of all registered agent instances."""
        return list(self._agents.values())

    def query(self, task_description: str, n_results: int = 1) -> List[str]:
        """
        Finds the most relevant agent(s) for a given task description using semantic search
        against the synthesized agent descriptions.
        """
        if not task_description:
            logger.warning("Query received with empty task description.")
            return []
            
        logger.info(f"Querying registry for task: '{task_description}'")
        
        try:
            query_embedding = self.embedding_model.encode(task_description).tolist()
        except Exception as e:
            logger.exception(f"Failed to encode query description '{task_description}'. Error: {e}")
            return [] # Return empty if query encoding fails

        try:
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=n_results
            )
            
            # Ensure results and metadatas are present and not empty
            if not results or not results.get('metadatas') or not results['metadatas'][0]:
                logger.warning(f"Registry query for '{task_description}' returned no results.")
                return []
            
            # Extract agent names from the metadata
            agent_names = [meta['agent_name'] for meta in results['metadatas'][0]]
            logger.info(f"Registry query returned best match(es): {agent_names}")
            
            return agent_names
        except Exception as e:
            logger.exception(f"Error during ChromaDB query for task '{task_description}': {e}")
            return [] # Return empty list on query error