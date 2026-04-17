"""Semantic RAG for regulatory domain knowledge.

Indexes SKILL.md and reference markdown files into a vector store at startup,
enabling the chat agent to retrieve contextually relevant regulatory knowledge
rather than relying on full-document injection or deterministic file lookups.

Architecture:
    - Embeddings: AWS Bedrock Titan (amazon.titan-embed-text-v2:0)
    - Vector store: FAISS (in-process, no external service)
    - Chunking: RecursiveCharacterTextSplitter (markdown-aware)
    - Retriever: similarity search, top-k=4
"""

import os
import glob
import boto3
from langchain_aws import BedrockEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from core.config import ReconConfig


# ---------------------------------------------------------------------------
# Document loader
# ---------------------------------------------------------------------------

def _load_skill_documents(skills_dir: str = "skills") -> list[Document]:
    """Recursively load all .md files under the skills directory."""
    docs = []
    patterns = [
        os.path.join(skills_dir, "**", "*.md"),
    ]

    for pattern in patterns:
        for path in glob.glob(pattern, recursive=True):
            with open(path, encoding="utf-8") as f:
                content = f.read()

            # Extract the relative path for metadata
            rel_path = os.path.relpath(path, skills_dir)
            # Derive a human-readable source name from the path
            source_name = rel_path.replace(os.sep, "/")

            docs.append(Document(
                page_content=content,
                metadata={
                    "source": source_name,
                    "abs_path": os.path.abspath(path),
                },
            ))

    return docs


# ---------------------------------------------------------------------------
# Vector store builder
# ---------------------------------------------------------------------------

_vectorstore = None


def build_vectorstore(config: ReconConfig | None = None) -> FAISS:
    """Build (or return cached) FAISS vector store from skill documents.

    Called once at startup; the index lives in memory for the server lifetime.
    """
    global _vectorstore
    if _vectorstore is not None:
        return _vectorstore

    if config is None:
        config = ReconConfig()

    # Load and chunk documents
    raw_docs = _load_skill_documents()
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n## ", "\n### ", "\n\n", "\n", " "],
    )
    chunks = splitter.split_documents(raw_docs)

    # Create embeddings via Bedrock Titan
    bedrock_client = boto3.client(
        "bedrock-runtime",
        region_name=config.bedrock_region,
    )
    embeddings = BedrockEmbeddings(
        client=bedrock_client,
        model_id="amazon.titan-embed-text-v2:0",
    )

    # Build FAISS index
    _vectorstore = FAISS.from_documents(chunks, embeddings)
    return _vectorstore


def get_retriever(config: ReconConfig | None = None, k: int = 4):
    """Return a retriever backed by the regulatory knowledge vector store."""
    store = build_vectorstore(config)
    return store.as_retriever(search_kwargs={"k": k})
