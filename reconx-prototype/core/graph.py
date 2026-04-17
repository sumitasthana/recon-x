from langgraph.graph import StateGraph, START, END
from core.state import ReconState
from core.compare import compare_node


def build_graph(report_id: str = "fr2052a"):
    """Build and compile the LangGraph StateGraph for a given report type.

    The compare node is shared across all reports.
    Extract and classify nodes come from the report plugin.
    """
    from reports import get_plugin

    plugin = get_plugin(report_id)

    graph = StateGraph(ReconState)
    graph.add_node("extract_source", plugin.extract_source_node)
    graph.add_node("extract_target", plugin.extract_target_node)
    graph.add_node("compare", compare_node)
    graph.add_node("classify", plugin.classify_node)
    graph.add_edge(START, "extract_source")
    graph.add_edge("extract_source", "extract_target")
    graph.add_edge("extract_target", "compare")
    graph.add_edge("compare", "classify")
    graph.add_edge("classify", END)
    return graph.compile()
