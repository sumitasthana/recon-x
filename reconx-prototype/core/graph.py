from langgraph.graph import StateGraph, START, END
from core.state import ReconState
from agents.extract_source import extract_source_node
from agents.extract_target import extract_target_node
from agents.compare import compare_node
from agents.classify import classify_node


def build_graph():
    """Build and compile the LangGraph StateGraph."""
    graph = StateGraph(ReconState)
    graph.add_node("extract_source", extract_source_node)
    graph.add_node("extract_target", extract_target_node)
    graph.add_node("compare", compare_node)
    graph.add_node("classify", classify_node)
    graph.add_edge(START, "extract_source")
    graph.add_edge("extract_source", "extract_target")
    graph.add_edge("extract_target", "compare")
    graph.add_edge("compare", "classify")
    graph.add_edge("classify", END)
    return graph.compile()
